/**
 * /api/users — staff / admin login accounts (cloud)
 *  POST {action:'login', username, pin, portal:'admin'|'staff'}
 *  POST {action:'forgot', identifier} · {action:'reset', identifier, code, newPin}
 *  GET    list users (Super Admin / Admin / Manager)
 *  POST   {action:'create', ...}   PATCH {username, ...}   DELETE ?username=
 *  Role rules: Manager → Staff/Receptionist/Driver · Admin → all but Super Admin · Super Admin → all
 */
import {
    json, preflight, readBody, readKey, writeKey, verifyToken, signToken, hashSecret, verifySecret,
    isEmail, normEmail, canManageRole, ADMIN_PORTAL_ROLES, ROLE_RANK, createResetCode, consumeResetCode,
    sendEmail, resetEmailHtml
} from '../lib/core.mjs';

const SEED = [
    { username: 'nkay', pin: '1986', role: 'Super Admin', email: 'greatcywila@gmail.com' },
    { username: 'admin1', pin: '2001', role: 'Admin', email: '' },
    { username: 'manager1', pin: '3001', role: 'Manager', email: '' },
    { username: 'receptionist1', pin: '4001', role: 'Receptionist', email: '' },
    { username: 'staff1', pin: '5001', role: 'Staff', email: '' }
];

async function loadUsers() {
    let users = await readKey('users', null);
    if (!Array.isArray(users) || users.length === 0) {
        users = SEED.map(u => ({
            username: u.username, role: u.role, email: u.email, phone: '', fullName: '',
            status: 'Active', pinHash: hashSecret(u.pin), createdAt: new Date().toISOString()
        }));
        await writeKey('users', users);
    }
    return users;
}

const pub = u => ({ username: u.username, fullName: u.fullName || '', role: u.role, email: u.email || '', phone: u.phone || '', status: u.status, createdAt: u.createdAt });
const validRole = r => Object.prototype.hasOwnProperty.call(ROLE_RANK, r);

export default async (req) => {
    if (req.method === 'OPTIONS') return preflight();
    try {
        const users = await loadUsers();
        const b = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);

        // ------------------------------------------------ public actions
        if (req.method === 'POST' && b.action === 'login') {
            const u = users.find(x => x.username.toLowerCase() === String(b.username || '').trim().toLowerCase());
            if (!u || u.status !== 'Active' || !verifySecret(String(b.pin || ''), u.pinHash)) return json({ error: 'Invalid username or PIN' }, 401);
            if (b.portal === 'admin' && !ADMIN_PORTAL_ROLES.includes(u.role)) {
                return json({ error: `${u.role} accounts use the Staff portal (staff.couturedecywila.com.ng)` }, 403);
            }
            const token = signToken({ kind: 'user', username: u.username, role: u.role }, 7);
            return json({ success: true, token, user: pub(u) });
        }

        if (req.method === 'POST' && b.action === 'forgot') {
            const id = String(b.identifier || b.username || '').trim().toLowerCase();
            const u = users.find(x => x.username.toLowerCase() === id || normEmail(x.email) === id);
            if (!u) return json({ error: 'No staff account found with that username or email' }, 404);
            if (!isEmail(u.email)) return json({ error: 'This account has no email on file. Please ask an Administrator to update your email or reset your PIN.' }, 400);
            const code = await createResetCode('user', u.username);
            await sendEmail({ to: u.email, subject: `Your PIN reset code: ${code} | Couture dé Cywila`, html: resetEmailHtml(u.fullName || u.username, code) });
            return json({ success: true, username: u.username });
        }

        if (req.method === 'POST' && b.action === 'reset') {
            const id = String(b.identifier || b.username || '').trim().toLowerCase();
            const u = users.find(x => x.username.toLowerCase() === id || normEmail(x.email) === id);
            if (!u) return json({ error: 'Account not found' }, 404);
            if (!/^\d{4,6}$/.test(String(b.newPin || ''))) return json({ error: 'PIN must be 4–6 digits' }, 400);
            if (!(await consumeResetCode('user', u.username, String(b.code || '')))) return json({ error: 'Invalid or expired code' }, 400);
            u.pinHash = hashSecret(b.newPin);
            await writeKey('users', users);
            return json({ success: true });
        }

        // ------------------------------------------------ authenticated management
        const who = verifyToken(req);
        if (!who || who.kind !== 'user') return json({ error: 'Please log in' }, 401);
        const actor = users.find(x => x.username === who.username && x.status === 'Active');
        if (!actor) return json({ error: 'Account disabled' }, 403);

        if (req.method === 'GET') {
            if (!ADMIN_PORTAL_ROLES.includes(actor.role)) return json({ error: 'Not allowed' }, 403);
            return json({ success: true, users: users.map(pub) });
        }

        if (req.method === 'POST' && b.action === 'create') {
            const username = String(b.username || '').trim();
            if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) return json({ error: 'Username must be 3–30 letters/numbers' }, 400);
            if (!isEmail(b.email)) return json({ error: 'A valid email is required' }, 400);
            if (!/^\d{4,6}$/.test(String(b.pin || ''))) return json({ error: 'PIN must be 4–6 digits' }, 400);
            if (!validRole(b.role)) return json({ error: 'Invalid role' }, 400);
            if (!canManageRole(actor.role, b.role)) return json({ error: `A ${actor.role} cannot create ${b.role} accounts` }, 403);
            if (users.some(x => x.username.toLowerCase() === username.toLowerCase())) return json({ error: 'Username already exists' }, 409);
            if (users.some(x => normEmail(x.email) === normEmail(b.email))) return json({ error: 'Email already used by another account' }, 409);
            const u = {
                username, role: b.role, email: normEmail(b.email), phone: b.phone || '', fullName: b.fullName || '',
                status: 'Active', pinHash: hashSecret(b.pin), createdAt: new Date().toISOString(), createdBy: actor.username
            };
            users.push(u);
            await writeKey('users', users);
            return json({ success: true, user: pub(u) }, 201);
        }

        if (req.method === 'PATCH') {
            const u = users.find(x => x.username === b.username);
            if (!u) return json({ error: 'User not found' }, 404);
            if (!canManageRole(actor.role, u.role) && actor.username !== u.username) return json({ error: 'Not allowed' }, 403);
            if (b.role && b.role !== u.role) {
                if (!validRole(b.role) || !canManageRole(actor.role, b.role)) return json({ error: 'Not allowed to assign that role' }, 403);
                u.role = b.role;
            }
            if (b.email !== undefined) {
                if (!isEmail(b.email)) return json({ error: 'A valid email is required' }, 400);
                u.email = normEmail(b.email);
            }
            if (b.fullName !== undefined) u.fullName = b.fullName;
            if (b.phone !== undefined) u.phone = b.phone;
            if (b.status && actor.username !== u.username) u.status = b.status;
            if (b.pin) {
                if (!/^\d{4,6}$/.test(String(b.pin))) return json({ error: 'PIN must be 4–6 digits' }, 400);
                u.pinHash = hashSecret(b.pin);
            }
            await writeKey('users', users);
            return json({ success: true, user: pub(u) });
        }

        if (req.method === 'DELETE') {
            const username = new URL(req.url).searchParams.get('username');
            const u = users.find(x => x.username === username);
            if (!u) return json({ error: 'User not found' }, 404);
            if (u.username === actor.username || !canManageRole(actor.role, u.role)) return json({ error: 'Not allowed' }, 403);
            await writeKey('users', users.filter(x => x.username !== username));
            return json({ success: true });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (err) {
        console.error('[users]', err);
        return json({ error: 'Server error: ' + err.message }, 500);
    }
};
