/**
 * Netlify Serverless Function: orders
 * Universal Persistent Cloud Store for Couture dé Cywila Ecosystem
 * 
 * Powered by Netlify Blobs (zero-configuration serverless persistence)
 * with automatic fallback to Supabase and in-memory caching.
 * Ensures realtime order visibility across:
 * - book.couturedecywila.com.ng (Customer Checkout)
 * - admin.couturedecywila.com.ng (Admin Suite & Accounting)
 * - staff.couturedecywila.com.ng (Staff Production Queue)
 */

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS'
};

// Initial Seed Orders
const SEED_ORDERS = [
    {
        orderId: 'ORD-901',
        customerId: 'CUST-001',
        customerName: 'Chinedu Okafor',
        customerEmail: 'chinedu@example.com',
        customerPhone: '+2348012345678',
        items: [{ id: 'LND-101', name: 'Executive Suit Wash & Steam', price: 3500, quantity: 2, type: 'laundry' }],
        subtotal: 7000,
        total: 10500,
        tierId: 'PREMIUM',
        tierName: 'PREMIUM',
        tierMultiplier: 1.5,
        deliveryAddress: '15 Victoria Island, Lagos',
        paymentMethod: 'FLUTTERWAVE',
        paymentStatus: 'paid',
        status: 'Processing',
        assignedTo: 'Lead Washer Ibrahim',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        expectedDeliveryDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
    },
    {
        orderId: 'ORD-902',
        customerId: 'CUST-002',
        customerName: 'Amina Bello',
        customerEmail: 'amina@example.com',
        customerPhone: '+2348023456789',
        items: [{ id: 'TLR-201', name: 'Bespoke Senator Wear (2-Piece)', price: 35000, quantity: 1, type: 'tailoring' }],
        subtotal: 35000,
        total: 70000,
        tierId: 'EXPRESS',
        tierName: 'EXPRESS',
        tierMultiplier: 2.0,
        deliveryAddress: '24 Lekki Phase 1, Lagos',
        paymentMethod: 'FLUTTERWAVE',
        paymentStatus: 'paid',
        status: 'Completed',
        assignedTo: 'Master Tailor Emeka',
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        expectedDeliveryDate: new Date(Date.now() - 86400000 * 1).toISOString().split('T')[0]
    }
];

// In-Memory Fallback Cache
let memoryStore = [...SEED_ORDERS];

/**
 * Access Netlify Blobs store safely
 */
function getBlobsStore() {
    try {
        const { getStore } = require('@netlify/blobs');
        return getStore({ name: 'couture_orders', consistency: 'strong' });
    } catch (e) {
        return null;
    }
}

/**
 * Fetch all orders from persistent storage
 */
async function fetchOrders() {
    const store = getBlobsStore();
    if (store) {
        try {
            const data = await store.get('orders', { type: 'json' });
            if (Array.isArray(data) && data.length > 0) {
                return data;
            }
            // Seed if empty
            await store.setJSON('orders', SEED_ORDERS);
            return [...SEED_ORDERS];
        } catch (err) {
            console.log('[Blobs Read Error, falling back]', err.message);
        }
    }

    // Optional Supabase integration
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
        try {
            const res = await fetch(`${supabaseUrl}/rest/v1/orders?select=*&order=createdAt.desc`, {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                }
            });
            if (res.ok) {
                const sbData = await res.json();
                if (Array.isArray(sbData) && sbData.length > 0) {
                    return sbData;
                }
            }
        } catch (err) {
            console.log('[Supabase Read Error]', err.message);
        }
    }

    return memoryStore;
}

/**
 * Save all orders to persistent storage
 */
async function saveOrders(orders) {
    memoryStore = orders;
    const store = getBlobsStore();
    if (store) {
        try {
            await store.setJSON('orders', orders);
        } catch (err) {
            console.log('[Blobs Write Error]', err.message);
        }
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
        try {
            // Upsert latest
            await fetch(`${supabaseUrl}/rest/v1/orders`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(orders)
            });
        } catch (err) {
            console.log('[Supabase Write Error]', err.message);
        }
    }
}

/**
 * Send automated email notifications via Resend
 */
async function dispatchResendEmails(order) {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) return;

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'greatcywila@gmail.com';
    const senderEmail = process.env.RESEND_SENDER_EMAIL || 'onboarding@resend.dev';

    let itemsHtml = (order.items || []).map(i => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${i.name || 'Service'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${i.quantity || 1}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">₦${((i.price || 0) * (i.quantity || 1)).toLocaleString()}</td>
        </tr>
    `).join('');

    // Customer Email
    if (order.customerEmail) {
        try {
            await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: `Couture dé Cywila <${senderEmail}>`,
                    to: [order.customerEmail],
                    reply_to: adminEmail,
                    subject: `Order Confirmation #${order.orderId} | Couture dé Cywila`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
                            <h2 style="color: #0D0D0D; margin-top: 0; border-bottom: 2px solid #C8A96A; padding-bottom: 12px;">Couture dé Cywila</h2>
                            <p>Dear <strong>${order.customerName || 'Valued Client'}</strong>,</p>
                            <p>Thank you for choosing Couture dé Cywila. Your order has been placed successfully in our <strong>${order.tierName}</strong> tier.</p>
                            <div style="background: #faf8f5; padding: 14px; border-radius: 6px; margin: 20px 0;">
                                <p style="margin: 4px 0;"><strong>Order ID:</strong> ${order.orderId}</p>
                                <p style="margin: 4px 0;"><strong>Service Tier:</strong> ${order.tierName}</p>
                                <p style="margin: 4px 0;"><strong>Expected Delivery:</strong> ${order.expectedDeliveryDate || 'Standard Schedule'}</p>
                                <p style="margin: 4px 0;"><strong>Delivery Address:</strong> ${order.deliveryAddress || 'Pending confirmation'}</p>
                            </div>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                                <thead>
                                    <tr style="background: #f5f5f5;">
                                        <th style="padding: 8px; text-align: left;">Item</th>
                                        <th style="padding: 8px; text-align: center;">Qty</th>
                                        <th style="padding: 8px; text-align: right;">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                    <tr>
                                        <td colspan="2" style="padding: 10px; font-weight: bold;">Total Amount</td>
                                        <td style="padding: 10px; font-weight: bold; text-align: right; color: #C8A96A;">₦${(order.total || 0).toLocaleString()}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <p style="color: #666; font-size: 13px;">WhatsApp Support: +234 815 555 9954</p>
                        </div>
                    `
                })
            });
        } catch (err) {
            console.log('[Resend Customer Email Error]', err.message);
        }
    }

    // Admin Alert Email
    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: `Couture Alerts <${senderEmail}>`,
                to: [adminEmail],
                subject: `🔔 New Order Received: #${order.orderId} (${order.tierName}) - ₦${(order.total || 0).toLocaleString()}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                        <h2 style="color: #C8A96A; margin-top: 0;">New Client Order #${order.orderId}</h2>
                        <p>A new order was just placed on <strong>book.couturedecywila.com.ng</strong>.</p>
                        <p><strong>Client:</strong> ${order.customerName} (${order.customerEmail || 'No email'}) - ${order.customerPhone || 'No phone'}</p>
                        <p><strong>Tier:</strong> ${order.tierName}</p>
                        <p><strong>Total:</strong> ₦${(order.total || 0).toLocaleString()}</p>
                        <p><strong>Address:</strong> ${order.deliveryAddress}</p>
                        <p><strong>Expected Delivery:</strong> ${order.expectedDeliveryDate}</p>
                        <div style="margin-top: 20px;">
                            <a href="https://admin.couturedecywila.com.ng" style="background: #16213e; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View in Admin Portal</a>
                        </div>
                    </div>
                `
            })
        });
    } catch (err) {
        console.log('[Resend Admin Alert Error]', err.message);
    }
}

exports.handler = async function(event, context) {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: CORS_HEADERS,
            body: ''
        };
    }

    try {
        const orders = await fetchOrders();

        // 1. GET: Return all orders
        if (event.httpMethod === 'GET') {
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: true,
                    count: orders.length,
                    orders: orders
                })
            };
        }

        // 2. POST: Create a new order
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const newOrder = {
                orderId: body.orderId || ('ORD-' + Date.now().toString().slice(-6)),
                customerId: body.customerId || 'CUST-' + Math.floor(100 + Math.random() * 900),
                customerName: body.customerName || 'Valued Client',
                customerEmail: body.customerEmail || '',
                customerPhone: body.customerPhone || '',
                items: Array.isArray(body.items) ? body.items : [],
                subtotal: Number(body.subtotal) || 0,
                total: Number(body.total) || 0,
                tierId: body.tierId || 'STANDARD',
                tierName: body.tierName || 'STANDARD',
                tierMultiplier: Number(body.tierMultiplier) || 1.0,
                deliveryAddress: body.deliveryAddress || 'Pending confirmation',
                paymentMethod: body.paymentMethod || 'FLUTTERWAVE',
                paymentStatus: body.paymentStatus || 'paid',
                status: body.status || 'Pending',
                assignedTo: body.assignedTo || 'Unassigned',
                createdAt: body.createdAt || new Date().toISOString(),
                expectedDeliveryDate: body.expectedDeliveryDate || new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0]
            };

            // Prepend new order to top of list
            const updated = [newOrder, ...orders.filter(o => o.orderId !== newOrder.orderId)];
            await saveOrders(updated);

            // Trigger Resend email dispatch in background
            dispatchResendEmails(newOrder).catch(e => console.log('[Email Dispatch Error]', e));

            return {
                statusCode: 201,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: true,
                    message: 'Order created and persisted successfully',
                    order: newOrder,
                    orders: updated
                })
            };
        }

        // 3. PATCH / PUT: Update order status (used by Staff and Admin)
        if (event.httpMethod === 'PATCH' || event.httpMethod === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            const targetId = body.orderId;
            if (!targetId) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'orderId is required' })
                };
            }

            let found = false;
            let updatedOrder = null;
            const updated = orders.map(order => {
                if (order.orderId === targetId) {
                    found = true;
                    updatedOrder = {
                        ...order,
                        status: body.status !== undefined ? body.status : order.status,
                        assignedTo: body.assignedTo !== undefined ? body.assignedTo : order.assignedTo,
                        updatedAt: new Date().toISOString()
                    };
                    return updatedOrder;
                }
                return order;
            });

            if (!found) {
                return {
                    statusCode: 404,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: `Order ${targetId} not found` })
                };
            }

            await saveOrders(updated);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: true,
                    message: 'Order updated successfully',
                    order: updatedOrder,
                    orders: updated
                })
            };
        }

        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    } catch (err) {
        console.error('[Orders API Error]', err);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: err.message })
        };
    }
};
