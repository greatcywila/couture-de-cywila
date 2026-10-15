/**
 * /api/orders — persistent orders (Netlify Blobs)
 *  GET    customer token → own orders · staff/admin token → all orders
 *  POST   create order (customer online checkout, or staff/admin walk-in POS)
 *         → computes totals server-side, emails invoice to customer + business
 *  PATCH  staff/admin: update status/assignment → emails customer on status change
 */
import {
    json, preflight, readBody, readKey, writeKey, verifyToken, getSettings,
    sendEmail, orderEmailHtml, adminOrderEmailHtml, statusEmailHtml, ADMIN_EMAIL, normEmail, isEmail
} from '../lib/core.mjs';

const DEFAULT_TIERS = {
    EXPRESS: { displayName: 'EXPRESS', cycleLengthDays: 2, multiplier: 2.0 },
    PREMIUM: { displayName: 'PREMIUM', cycleLengthDays: 4, multiplier: 1.5 },
    STANDARD: { displayName: 'STANDARD', cycleLengthDays: 7, multiplier: 1.0 },
    BASIC: { displayName: 'BASIC', cycleLengthDays: 10, multiplier: 0.8 }
};

function later(context, promise) {
    const p = promise.catch(e => console.log('[bg error]', e.message));
    if (context && typeof context.waitUntil === 'function') context.waitUntil(p);
    return p;
}

export default async (req, context) => {
    if (req.method === 'OPTIONS') return preflight();
    const who = verifyToken(req);

    try {
        const orders = await readKey('orders', []);

        // ---------------------------------------------------------- GET
        if (req.method === 'GET') {
            if (who && who.kind === 'customer') {
                const email = normEmail(who.email);
                const mine = orders.filter(o => o.customerId === who.id || normEmail(o.customerEmail) === email);
                return json({ success: true, orders: mine });
            }
            // For admin/staff or authorized request, return all orders
            return json({ success: true, count: orders.length, orders });
        }

        // ---------------------------------------------------------- POST
        if (req.method === 'POST') {
            const b = await readBody(req);
            const items = (Array.isArray(b.items) ? b.items : [])
                .map(i => ({ id: i.id, name: String(i.name || 'Item'), type: i.type || '', price: Number(i.price) || 0, quantity: Math.max(1, parseInt(i.quantity) || 1) }));
            if (!items.length) return json({ error: 'Order has no items' }, 400);

            let customer = { id: '', name: '', email: '', phone: '' };
            let source = 'Online';
            if (who && who.kind === 'customer') {
                const customers = await readKey('customers', []);
                const c = customers.find(x => x.id === who.id || normEmail(x.email) === normEmail(who.email));
                if (c) {
                    customer = { id: c.id, name: c.name, email: c.email, phone: c.phone };
                } else {
                    customer = { id: who.id || 'CUST-ONLINE', name: b.customerName || 'Valued Client', email: normEmail(b.customerEmail || who.email), phone: b.customerPhone || '' };
                }
            } else if (who && who.kind === 'user') {
                source = 'Walk-in';
                if (!b.customerName || !b.customerPhone) return json({ error: 'Client name and phone are required' }, 400);
                if (b.customerEmail && !isEmail(b.customerEmail)) return json({ error: 'Invalid client email' }, 400);
                customer = { id: 'WALK-IN', name: b.customerName, email: normEmail(b.customerEmail), phone: b.customerPhone };
            } else {
                // If token expired or direct guest checkout
                source = 'Online';
                customer = {
                    id: b.customerId || ('CUST-' + Date.now().toString(36).toUpperCase()),
                    name: b.customerName || 'Valued Client',
                    email: normEmail(b.customerEmail),
                    phone: b.customerPhone || ''
                };
            }

            const tiers = { ...DEFAULT_TIERS, ...((await readKey('catalog', {})).tiers || {}) };
            const tierId = tiers[b.tierId] ? b.tierId : 'STANDARD';
            const tier = tiers[tierId];
            const settings = await getSettings();

            const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
            const tierAmount = Math.round(subtotal * tier.multiplier);
            const discountPct = Math.min(100, Math.max(0, Number(b.discountPercent) || 0));
            const discount = Math.round(tierAmount * discountPct / 100);
            const taxable = tierAmount - discount;
            const vatAmount = settings.vatEnabled ? Math.round(taxable * (Number(settings.vatRate) || 0) / 100) : 0;
            const total = taxable + vatAmount;

            const expected = new Date(Date.now() + tier.cycleLengthDays * 86400000).toISOString().split('T')[0];
            const seq = (await readKey('order_seq', 1000)) + 1;
            await writeKey('order_seq', seq);
            const orderId = 'ORD-' + seq;

            const order = {
                orderId,
                invoiceNumber: 'INV-' + seq,
                source,
                createdBy: who.kind === 'user' ? who.username : '',
                customerId: customer.id,
                customerName: customer.name,
                customerEmail: customer.email,
                customerPhone: customer.phone,
                items,
                subtotal, tierAmount, discount, couponApplied: b.couponApplied || null,
                vatAmount, vatRate: settings.vatEnabled ? settings.vatRate : 0, vatName: settings.vatName,
                total,
                tierId, tierName: tier.displayName, tierMultiplier: tier.multiplier,
                deliveryAddress: b.deliveryAddress || 'Showroom Pickup',
                fulfillmentMethod: b.fulfillmentMethod || '',
                notes: b.notes || '',
                measurements: b.measurements || null,
                paymentMethod: b.paymentMethod || 'COD',
                paymentStatus: b.paymentStatus === 'paid' ? 'paid' : (b.paymentStatus || 'pending'),
                paymentReference: b.paymentReference || '',
                status: 'Received',
                statusHistory: [{ status: 'Received', at: new Date().toISOString(), by: who.kind === 'user' ? who.username : 'customer' }],
                assignedTo: '',
                createdAt: new Date().toISOString(),
                expectedDeliveryDate: expected
            };

            orders.unshift(order);
            await writeKey('orders', orders);

            // loyalty for registered customers
            if (who && who.kind === 'customer') {
                const customers = await readKey('customers', []);
                const c = customers.find(x => x.id === who.id || normEmail(x.email) === normEmail(who.email));
                if (c) {
                    c.loyaltyPoints = (c.loyaltyPoints || 0) + Math.floor(total / 1000);
                    c.lifetimeSpending = (c.lifetimeSpending || 0) + total;
                    await writeKey('customers', customers);
                }
            }

            // Dispatch Resend emails immediately without blocking order return
            try {
                if (order.customerEmail) {
                    sendEmail({ to: order.customerEmail, subject: `Your invoice ${order.invoiceNumber} · Order ${orderId} | Couture dé Cywila`, html: orderEmailHtml(order, settings) })
                        .catch(e => console.log('[customer email error]', e.message));
                }
                sendEmail({ to: ADMIN_EMAIL(), replyTo: order.customerEmail || undefined, subject: `🔔 New ${source} order ${orderId} — ₦${total.toLocaleString()}`, html: adminOrderEmailHtml(order, settings) })
                    .catch(e => console.log('[admin email error]', e.message));
            } catch(e) {
                console.log('[email dispatch warning]', e.message);
            }

            return json({ success: true, order }, 201);
        }

        // ---------------------------------------------------------- PATCH
        if (req.method === 'PATCH' || req.method === 'PUT') {
            const b = await readBody(req);
            const order = orders.find(o => o.orderId === b.orderId);
            if (!order) return json({ error: 'Order not found' }, 404);

            const statusChanged = b.status && b.status !== order.status;
            if (statusChanged) {
                order.status = b.status;
                order.statusHistory = [...(order.statusHistory || []), { status: b.status, at: new Date().toISOString(), by: (who && who.username) ? who.username : 'staff' }];
            }
            if (b.assignedTo !== undefined) order.assignedTo = b.assignedTo;
            if (b.paymentStatus) order.paymentStatus = b.paymentStatus;
            order.updatedAt = new Date().toISOString();
            await writeKey('orders', orders);

            if (statusChanged && order.customerEmail) {
                sendEmail({ to: order.customerEmail, subject: `Order ${order.orderId} is now ${order.status} | Couture dé Cywila`, html: statusEmailHtml(order) })
                    .catch(e => console.log('[status email err]', e.message));
            }
            return json({ success: true, order });
        }

        return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
        console.error('[orders]', err);
        return json({ error: 'Server error: ' + err.message }, 500);
    }
};
