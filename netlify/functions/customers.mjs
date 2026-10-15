/**
 * /api/customers — cloud customer accounts
 *  POST {action:'signup'|'login'|'forgot'|'reset'|'update'|'me'}
 *  GET  admin/manager/receptionist token → customer list (no password hashes)
 */
import {
    json, preflight, readBody, readKey, writeKey, verifyToken, signToken, hashSecret, verifySecret,
    isEmail, normEmail, createResetCode, consumeResetCode, sendEmail, resetEmailHtml
} from '../lib/core.mjs';

const publicCustomer = c => ({
    id: c.id, name: c.name, email: c.email, phone: c.phone, birthdate: c.birthdate || '',
    loyaltyPoints: c.loyaltyPoints || 0, lifetimeSpending: c.lifetimeSpending || 0,
    measurements: c.measurements || null, createdAt: c.createdAt
});

export default async (req) => {
    if (req.method === 'OPTIONS') return preflight();
    try {
        const customers = await readKey('customers', []);

        if (req.method === 'GET') {
            const who = verifyToken(req);
            if (!who || who.kind !== 'user' || !['Super Admin', 'Admin', 'Manager', 'Receptionist'].includes(who.role)) {
                return json({ error: 'Not allowed' }, 403);
            }
            return json({ success: true, customers: customers.map(publicCustomer) });
        }
        if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

        const b = await readBody(req);
        const email = normEmail(b.email);

        if (b.action === 'signup') {
            const name = String(b.name || '').trim();
            const phone = String(b.phone || '').trim();
            if (!name || !isEmail(email) || !phone) return json({ error: 'Full name, a valid email and phone number are required' }, 400);
            if (String(b.password || '').length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
            if (customers.some(c => c.email === email)) return json({ error: 'This email is already registered. Please log in or reset your password.' }, 409);
            const c = {
                id: 'CUST-' + Date.now().toString(36).toUpperCase(),
                name, email, phone, birthdate: b.birthdate || '',
                passwordHash: hashSecret(b.password),
                loyaltyPoints: 0, lifetimeSpending: 0, createdAt: new Date().toISOString()
            };
            customers.push(c);
            await writeKey('customers', customers);
            return json({ success: true, token: signToken({ kind: 'customer', id: c.id, email }), customer: publicCustomer(c) }, 201);
        }

        if (b.action === 'login') {
            const c = customers.find(x => x.email === email);
            if (!c || !verifySecret(b.password || '', c.passwordHash)) return json({ error: 'Invalid email or password' }, 401);
            return json({ success: true, token: signToken({ kind: 'customer', id: c.id, email }), customer: publicCustomer(c) });
        }

        if (b.action === 'forgot') {
            const c = customers.find(x => x.email === email);
            if (!c) return json({ error: 'No customer account found with this email' }, 404);
            const code = await createResetCode('customer', c.id);
            await sendEmail({ to: c.email, subject: `Your password reset code: ${code} | Couture dé Cywila`, html: resetEmailHtml(c.name, code) });
            return json({ success: true });
        }

        if (b.action === 'reset') {
            const c = customers.find(x => x.email === email);
            if (!c) return json({ error: 'Account not found' }, 404);
            if (String(b.newPassword || '').length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
            if (!(await consumeResetCode('customer', c.id, String(b.code || '')))) return json({ error: 'Invalid or expired code' }, 400);
            c.passwordHash = hashSecret(b.newPassword);
            await writeKey('customers', customers);
            return json({ success: true, token: signToken({ kind: 'customer', id: c.id, email }), customer: publicCustomer(c) });
        }

        // authenticated customer actions
        const who = verifyToken(req);
        if (!who || who.kind !== 'customer') return json({ error: 'Please log in' }, 401);
        const c = customers.find(x => x.id === who.id);
        if (!c) return json({ error: 'Account not found' }, 404);

        if (b.action === 'me') return json({ success: true, customer: publicCustomer(c) });

        if (b.action === 'update') {
            if (b.name) c.name = String(b.name).trim();
            if (b.phone) c.phone = String(b.phone).trim();
            if (b.measurements) c.measurements = b.measurements;
            await writeKey('customers', customers);
            return json({ success: true, customer: publicCustomer(c) });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (err) {
        console.error('[customers]', err);
        return json({ error: 'Server error: ' + err.message }, 500);
    }
};
