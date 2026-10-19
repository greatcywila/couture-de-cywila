/**
 * /api/subscriptions — persistent cloud subscriptions (Netlify Blobs)
 *  GET    customer token → own subscriptions · staff/admin token → all subscriptions
 *  POST   create new subscription (online checkout / walk-in)
 *  PATCH  customer or staff: update status ('active' | 'paused' | 'cancelled') or log items used
 */
import {
    json, preflight, readBody, readKey, writeKey, verifyToken, normEmail, isEmail
} from '../lib/core.mjs';

const SEED_SUBSCRIPTIONS = [
    {
        id: 'SUB-101',
        customerId: 'CUST-001',
        customerName: 'Chinedu Okafor',
        customerEmail: 'chinedu@example.com',
        customerPhone: '+2348012345678',
        planId: 'PLN-301',
        planName: 'Executive Weekly Plan',
        planType: 'laundry',
        frequency: 'Weekly',
        cost: 18000,
        quotaItems: 15,
        itemsUsed: 6,
        status: 'active',
        startDate: new Date(Date.now() - 86400000 * 10).toISOString(),
        nextPickup: new Date(Date.now() + 86400000 * 4).toISOString(),
        renewalDate: new Date(Date.now() + 86400000 * 18).toISOString(),
        paymentStatus: 'paid'
    }
];

export default async (req) => {
    if (req.method === 'OPTIONS') return preflight();
    const who = verifyToken(req);

    try {
        let subscriptions = await readKey('subscriptions', null);
        if (!subscriptions) {
            subscriptions = SEED_SUBSCRIPTIONS;
            await writeKey('subscriptions', subscriptions);
        }

        // ---------------------------------------------------------- GET
        if (req.method === 'GET') {
            if (who && who.kind === 'customer') {
                const email = normEmail(who.email);
                const mine = subscriptions.filter(s => s.customerId === who.id || (s.customerEmail && normEmail(s.customerEmail) === email));
                return json({ success: true, count: mine.length, subscriptions: mine });
            }
            if (who && who.kind === 'user') {
                // Admin / Staff portal: view all subscriptions
                return json({ success: true, count: subscriptions.length, subscriptions });
            }
            // If not authenticated or unverified token, return empty array to protect customer privacy
            return json({ success: true, count: 0, subscriptions: [] });
        }

        // ---------------------------------------------------------- POST (Create Subscription)
        if (req.method === 'POST') {
            const b = await readBody(req);
            if (!b.planName || !b.cost) {
                return json({ error: 'Plan details and cost are required' }, 400);
            }

            let customer = { id: '', name: '', email: '', phone: '' };
            if (who && who.kind === 'customer') {
                customer = {
                    id: who.id || 'CUST-ONLINE',
                    name: b.customerName || 'Valued Client',
                    email: normEmail(b.customerEmail || who.email),
                    phone: b.customerPhone || ''
                };
            } else if (who && who.kind === 'user') {
                customer = {
                    id: b.customerId || ('CUST-SUB-' + Date.now().toString(36).toUpperCase()),
                    name: b.customerName || 'Walk-in Client',
                    email: normEmail(b.customerEmail),
                    phone: b.customerPhone || ''
                };
            } else {
                customer = {
                    id: b.customerId || ('CUST-SUB-' + Date.now().toString(36).toUpperCase()),
                    name: b.customerName || 'Valued Client',
                    email: normEmail(b.customerEmail),
                    phone: b.customerPhone || ''
                };
            }

            const seq = (await readKey('subscription_seq', 500)) + 1;
            await writeKey('subscription_seq', seq);
            const subId = 'SUB-' + seq;

            const daysMap = { 'Weekly': 7, 'Bi-Weekly': 14, 'Monthly': 30, 'Quarterly': 90, 'Annually': 365 };
            const cycleDays = daysMap[b.frequency] || 30;

            const newSub = {
                id: subId,
                customerId: customer.id,
                customerName: customer.name,
                customerEmail: customer.email,
                customerPhone: customer.phone,
                planId: b.planId || '',
                planName: String(b.planName),
                planType: b.planType || 'laundry',
                frequency: b.frequency || 'Monthly',
                cost: Number(b.cost) || 0,
                quotaItems: parseInt(b.quotaItems || b.items) || 15,
                itemsUsed: 0,
                status: 'active',
                startDate: new Date().toISOString(),
                nextPickup: new Date(Date.now() + 7 * 86400000).toISOString(),
                renewalDate: new Date(Date.now() + cycleDays * 86400000).toISOString(),
                paymentStatus: b.paymentStatus || 'paid',
                paymentMethod: b.paymentMethod || 'Online',
                notes: b.notes || '',
                createdAt: new Date().toISOString()
            };

            subscriptions.unshift(newSub);
            await writeKey('subscriptions', subscriptions);

            return json({ success: true, subscription: newSub }, 201);
        }

        // ---------------------------------------------------------- PATCH (Update Status or Items Used)
        if (req.method === 'PATCH' || req.method === 'PUT') {
            const b = await readBody(req);
            const targetId = b.id || b.subscriptionId;
            const sub = subscriptions.find(s => s.id === targetId);
            if (!sub) return json({ error: 'Subscription not found' }, 404);

            if (b.status) {
                const allowed = ['active', 'paused', 'cancelled', 'expired'];
                if (allowed.includes(b.status.toLowerCase())) {
                    sub.status = b.status.toLowerCase();
                }
            }

            if (b.itemsUsed !== undefined) {
                sub.itemsUsed = Math.max(0, parseInt(b.itemsUsed) || 0);
            }

            if (b.incrementItems) {
                const add = parseInt(b.incrementItems) || 1;
                sub.itemsUsed = Math.min(sub.quotaItems, (sub.itemsUsed || 0) + add);
            }

            if (b.nextPickup) sub.nextPickup = b.nextPickup;
            sub.updatedAt = new Date().toISOString();

            await writeKey('subscriptions', subscriptions);
            return json({ success: true, subscription: sub });
        }

        // ---------------------------------------------------------- DELETE
        if (req.method === 'DELETE') {
            const whoUser = verifyToken(req);
            if (!whoUser || whoUser.kind !== 'user') return json({ error: 'Admin access required' }, 403);
            const url = new URL(req.url);
            const b = await readBody(req);
            const targetId = b.id || b.subscriptionId || url.searchParams.get('id');
            if (!targetId) return json({ error: 'Subscription ID required' }, 400);

            subscriptions = subscriptions.filter(s => s.id !== targetId);
            await writeKey('subscriptions', subscriptions);
            return json({ success: true, message: 'Subscription removed' });
        }

        return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
        console.error('[subscriptions API]', err);
        return json({ error: 'Subscriptions error: ' + err.message }, 500);
    }
};
