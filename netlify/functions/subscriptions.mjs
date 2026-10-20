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

        // Backfill check: Scan orders for subscription items not yet in subscriptions store
        try {
            const orders = await readKey('orders', []);
            let needWrite = false;
            let seq = (await readKey('subscription_seq', 500));
            const catalog = await readKey('catalog', {});

            for (const ord of orders) {
                const subItems = (ord.items || []).filter(i => i.type === 'subscription' || i.type === 'tailoring_plan' || (i.id && (i.id.startsWith('PLN-') || i.id.startsWith('TPLN-'))));
                for (const item of subItems) {
                    const exists = subscriptions.some(s => s.orderId === ord.orderId && s.planId === item.id);
                    if (!exists) {
                        seq += 1;
                        needWrite = true;
                        const isLaundry = item.type === 'subscription' || (item.id && item.id.startsWith('PLN-'));
                        let quota = 15;
                        let frequency = 'Monthly';
                        if (isLaundry && Array.isArray(catalog.laundryPlans)) {
                            const p = catalog.laundryPlans.find(x => x.id === item.id);
                            if (p) {
                                quota = parseInt(p.items) || 15;
                                frequency = p.frequency || 'Monthly';
                            }
                        } else if (!isLaundry && Array.isArray(catalog.tailoringPlans)) {
                            const p = catalog.tailoringPlans.find(x => x.id === item.id);
                            if (p) {
                                quota = parseInt(p.items) || 3;
                                frequency = p.frequency || 'Quarterly';
                            }
                        }

                        const daysMap = { 'Weekly': 7, 'Bi-Weekly': 14, 'Monthly': 30, 'Quarterly': 90, 'Annually': 365 };
                        const cycleDays = daysMap[frequency] || 30;

                        subscriptions.unshift({
                            id: 'SUB-' + seq,
                            orderId: ord.orderId,
                            customerId: ord.customerId || '',
                            customerName: ord.customerName || 'Valued Client',
                            customerEmail: normEmail(ord.customerEmail),
                            customerPhone: ord.customerPhone || '',
                            planId: item.id,
                            planName: item.name,
                            planType: isLaundry ? 'laundry' : 'tailoring',
                            frequency: frequency,
                            cost: item.price,
                            price: item.price,
                            quotaItems: quota,
                            itemsQuota: quota,
                            itemsTotal: quota,
                            itemsUsed: 0,
                            status: 'active',
                            startDate: ord.createdAt || new Date().toISOString(),
                            nextPickup: new Date(Date.now() + 7 * 86400000).toISOString(),
                            nextPickupDate: new Date(Date.now() + 7 * 86400000).toISOString(),
                            renewalDate: new Date(Date.now() + cycleDays * 86400000).toISOString(),
                            paymentStatus: ord.paymentStatus || 'paid',
                            paymentMethod: ord.paymentMethod || 'Online',
                            createdAt: ord.createdAt || new Date().toISOString()
                        });
                    }
                }
            }

            if (needWrite) {
                await writeKey('subscription_seq', seq);
                await writeKey('subscriptions', subscriptions);
            }
        } catch(e) {
            console.log('[subscriptions backfill error]', e.message);
        }

        // Standardize properties for frontend rendering
        const normalizedSubs = subscriptions.map(s => ({
            ...s,
            price: Number(s.price || s.cost || 0),
            cost: Number(s.cost || s.price || 0),
            itemsQuota: Number(s.itemsQuota || s.quotaItems || s.itemsTotal || 0),
            quotaItems: Number(s.quotaItems || s.itemsQuota || s.itemsTotal || 0),
            itemsTotal: Number(s.itemsTotal || s.itemsQuota || s.quotaItems || 0),
            itemsUsed: Number(s.itemsUsed || 0),
            nextPickupDate: s.nextPickupDate || s.nextPickup,
            nextPickup: s.nextPickup || s.nextPickupDate
        }));

        // ---------------------------------------------------------- GET
        if (req.method === 'GET') {
            if (who && who.kind === 'customer') {
                const email = normEmail(who.email);
                const mine = normalizedSubs.filter(s => s.customerId === who.id || (s.customerEmail && normEmail(s.customerEmail) === email));
                return json({ success: true, count: mine.length, subscriptions: mine });
            }
            if (who && who.kind === 'user') {
                // Admin / Staff portal: view all subscriptions
                return json({ success: true, count: normalizedSubs.length, subscriptions: normalizedSubs });
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

        // ---------------------------------------------------------- PATCH (Update Status, Quota or Log Usage)
        if (req.method === 'PATCH' || req.method === 'PUT') {
            // Strict Role Access Control for Staff:
            // Allowed: Super Admin, Admin, Manager, Receptionist, and Customers (for their own subscriptions).
            // Blocked: Tailor, Washer, Ironer, Driver, General Staff.
            if (who && who.kind === 'user') {
                const allowedRoles = ['Super Admin', 'Admin', 'Manager', 'Receptionist'];
                if (!allowedRoles.includes(who.role)) {
                    return json({ error: 'Permission Denied: Only Receptionist, Manager, Admin and Super Admin can manage or adjust client subscriptions.' }, 403);
                }
            }

            const b = await readBody(req);
            const targetId = b.id || b.subscriptionId;
            const sub = subscriptions.find(s => s.id === targetId);
            if (!sub) return json({ error: 'Subscription not found' }, 404);

            // Customers can only modify their own subscriptions
            if (who && who.kind === 'customer') {
                const myEmail = normEmail(who.email);
                const isMine = sub.customerId === who.id || (sub.customerEmail && normEmail(sub.customerEmail) === myEmail);
                if (!isMine) {
                    return json({ error: 'Unauthorized to modify this subscription' }, 403);
                }
            }

            const quota = Number(sub.itemsQuota || sub.quotaItems || sub.itemsTotal || 15);
            let currentUsed = Number(sub.itemsUsed || 0);

            // Handle logging clothes usage (e.g. customer sends 8 clothes, or receptionist receives 8 clothes)
            if (b.useItems !== undefined || b.logUsage !== undefined) {
                const sendCount = parseInt(b.useItems || b.logUsage) || 0;
                if (sendCount <= 0) {
                    return json({ error: 'Please enter a valid number of clothes to send (at least 1).' }, 400);
                }
                const remaining = Math.max(0, quota - currentUsed);
                if (sendCount > remaining) {
                    return json({ error: `Cannot send ${sendCount} clothes. Only ${remaining} garments remaining in your plan quota.` }, 400);
                }

                currentUsed += sendCount;
                sub.itemsUsed = currentUsed;

                const usageRecord = {
                    date: new Date().toISOString(),
                    quantity: sendCount,
                    notes: b.notes || (b.pickupAddress ? `Pickup at: ${b.pickupAddress}` : 'Garments received for care'),
                    by: (who && (who.username || who.name || who.email)) || 'Customer',
                    role: (who && who.role) || (who && who.kind) || 'Customer'
                };
                sub.usageHistory = [...(sub.usageHistory || []), usageRecord];

                // Auto-update next pickup date if requested
                if (b.pickupDate) {
                    sub.nextPickupDate = b.pickupDate;
                    sub.nextPickup = b.pickupDate;
                }

                // If quota exhausted, mark status
                if (currentUsed >= quota) {
                    sub.status = 'completed';
                }
            } else if (b.itemsUsed !== undefined) {
                // Direct set by Admin/Manager/Receptionist
                sub.itemsUsed = Math.max(0, Math.min(quota, parseInt(b.itemsUsed) || 0));
                if (sub.itemsUsed >= quota) {
                    sub.status = 'completed';
                } else if (sub.status === 'completed') {
                    sub.status = 'active';
                }
            }

            if (b.incrementItems) {
                const add = parseInt(b.incrementItems) || 1;
                sub.itemsUsed = Math.max(0, Math.min(quota, (sub.itemsUsed || 0) + add));
                if (sub.itemsUsed >= quota) {
                    sub.status = 'completed';
                }
            }

            if (b.status) {
                const allowed = ['active', 'paused', 'cancelled', 'expired', 'completed'];
                if (allowed.includes(b.status.toLowerCase())) {
                    sub.status = b.status.toLowerCase();
                }
            }

            if (b.nextPickup) {
                sub.nextPickup = b.nextPickup;
                sub.nextPickupDate = b.nextPickup;
            }
            if (b.nextPickupDate) {
                sub.nextPickupDate = b.nextPickupDate;
                sub.nextPickup = b.nextPickupDate;
            }

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
