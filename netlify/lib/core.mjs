/**
 * Couture dé Cywila — shared server core
 * Cloud storage (Netlify Blobs), auth tokens, password hashing, Resend email.
 * Used by all /api/* functions (Netlify Functions v2, ESM).
 */
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

// ---------------------------------------------------------------- storage
const STORE_NAME = 'couture_data';

export function db() {
    return getStore({ name: STORE_NAME, consistency: 'strong' });
}

export async function readKey(key, fallback) {
    const data = await db().get(key, { type: 'json' });
    return data === null || data === undefined ? fallback : data;
}

export async function writeKey(key, value) {
    await db().setJSON(key, value);
}

// ---------------------------------------------------------------- http
export const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS'
};

export function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: CORS });
}

export function preflight() {
    return new Response('', { status: 204, headers: CORS });
}

export async function readBody(req) {
    try { return await req.json(); } catch { return {}; }
}

export function isEmail(v) {
    return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

export function normEmail(v) {
    return String(v || '').trim().toLowerCase();
}

// ---------------------------------------------------------------- crypto
const SECRET = process.env.AUTH_SECRET || process.env.RESEND_API_KEY || 'cywila-dev-secret-change-me';

export function hashSecret(plain) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

export function verifySecret(plain, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(String(plain), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

export function signToken(payload, days = 30) {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + days * 86400000 })).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
}

export function verifyToken(req) {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token.includes('.')) return null;
    const [body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        return payload.exp > Date.now() ? payload : null;
    } catch { return null; }
}

export function randomCode() {
    return String(crypto.randomInt(100000, 1000000));
}

// ---------------------------------------------------------------- roles
export const ROLE_RANK = { 
    'Super Admin': 5, 
    'Admin': 4, 
    'Manager': 3, 
    'Receptionist': 2, 
    'Tailor': 1, 
    'Washer': 1, 
    'Ironer': 1, 
    'Driver': 1,
    'Driver/Rider': 1,
    'Staff': 1 
};
export const ADMIN_PORTAL_ROLES = ['Super Admin', 'Admin', 'Manager'];
export const STAFF_PORTAL_ROLES = ['Receptionist', 'Tailor', 'Washer', 'Ironer', 'Driver', 'Driver/Rider', 'Staff', 'Manager', 'Admin'];

/** Which roles may a given role create/edit? */
export function canManageRole(actorRole, targetRole) {
    if (actorRole === 'Super Admin') return true;
    if (actorRole === 'Admin') return targetRole !== 'Super Admin';
    if (actorRole === 'Manager') return ['Staff', 'Receptionist', 'Tailor', 'Washer', 'Ironer', 'Driver', 'Driver/Rider'].includes(targetRole);
    if (actorRole === 'Receptionist') return ['Tailor', 'Washer', 'Ironer', 'Driver', 'Driver/Rider'].includes(targetRole);
    return false;
}

export function requireUser(req, minRoles) {
    const p = verifyToken(req);
    if (!p || p.kind !== 'user') return null;
    if (minRoles && !minRoles.includes(p.role)) return null;
    return p;
}

// ---------------------------------------------------------------- settings
export const DEFAULT_SETTINGS = {
    businessName: 'Couture dé Cywila',
    businessEmail: 'greatcywila@gmail.com',
    businessPhone: '',
    businessWhatsapp: '',
    businessAddress: '',
    vatEnabled: false,
    vatRate: 7.5,
    vatName: 'VAT',
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    flutterwavePublicKey: '',
    paystackPublicKey: ''
};

export async function getSettings() {
    const s = await readKey('settings', {});
    return { ...DEFAULT_SETTINGS, ...s };
}

// ---------------------------------------------------------------- email
export async function sendEmail({ to, subject, html, replyTo }) {
    const key = process.env.RESEND_API_KEY;
    if (!key || !to) {
        console.log('[email skipped]', subject, to);
        return { skipped: true };
    }
    const customFrom = process.env.RESEND_SENDER_EMAIL || 'orders@couturedecywila.com.ng';
    
    // First attempt with configured sender
    let res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: `Couture dé Cywila <${customFrom}>`,
            to: Array.isArray(to) ? to : [to],
            reply_to: replyTo || process.env.ADMIN_NOTIFICATION_EMAIL || 'greatcywila@gmail.com',
            subject,
            html
        })
    });

    // If custom domain is not yet verified on Resend (e.g. 403 or unverified domain), fallback to onboarding@resend.dev
    if (!res.ok && res.status >= 400 && customFrom !== 'onboarding@resend.dev') {
        const errText = await res.text();
        console.log('[resend primary error, falling back]', res.status, errText);
        try {
            res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: 'Couture dé Cywila <onboarding@resend.dev>',
                    to: Array.isArray(to) ? to : [to],
                    reply_to: replyTo || process.env.ADMIN_NOTIFICATION_EMAIL || 'greatcywila@gmail.com',
                    subject,
                    html
                })
            });
        } catch(e) {}
    }

    return { status: res.status };
}

export const ADMIN_EMAIL = () => process.env.ADMIN_NOTIFICATION_EMAIL || 'greatcywila@gmail.com';
export const SITE = 'https://couturedecywila.com.ng';
export const LOGO_URL = `${SITE}/images/logo.png`;

const naira = n => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

function shell(inner) {
    return `<div style="background:#0f0f1e;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;">
<div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
<div style="background:linear-gradient(135deg,#8B5CF6,#EC4899);padding:22px;text-align:center;">
<img src="${LOGO_URL}" alt="Couture dé Cywila" style="height:64px;background:#ffffff;border-radius:10px;padding:6px 12px;">
</div><div style="padding:28px 26px;color:#1f2937;font-size:15px;line-height:1.6;">${inner}</div>
<div style="background:#f5f3ff;padding:14px;text-align:center;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} Couture dé Cywila · Crafted to fit, styled to last.</div>
</div></div>`;
}

/** Invoice HTML (layout adapted from Mr. Ita's INVOICE-GENERATOR-V1) */
export function invoiceHtml(order, s) {
    const rows = (order.items || []).map(i => `<tr>
<td style="padding:9px;border-bottom:1px solid #eee;">${i.name}</td>
<td style="padding:9px;border-bottom:1px solid #eee;text-align:center;">${i.quantity || 1}</td>
<td style="padding:9px;border-bottom:1px solid #eee;text-align:right;">${naira(i.price)}</td>
<td style="padding:9px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${naira((i.price || 0) * (i.quantity || 1))}</td></tr>`).join('');
    const showBank = s.bankAccountNumber && order.paymentStatus !== 'paid';
    return `
<table style="width:100%;margin-bottom:18px;"><tr>
<td><h2 style="margin:0;color:#7C3AED;">INVOICE</h2><div style="color:#6b7280;font-size:13px;">${order.invoiceNumber || 'INV-' + order.orderId}</div></td>
<td style="text-align:right;font-size:13px;color:#6b7280;">Date: ${new Date(order.createdAt).toLocaleDateString('en-GB')}<br>Order: <b>${order.orderId}</b></td></tr></table>
<table style="width:100%;font-size:13px;margin-bottom:18px;"><tr>
<td style="vertical-align:top;"><b>From</b><br>${s.businessName}<br>${s.businessAddress || ''}<br>${s.businessEmail || ''}<br>${s.businessPhone || ''}</td>
<td style="vertical-align:top;text-align:right;"><b>Bill To</b><br>${order.customerName || ''}<br>${order.customerEmail || ''}<br>${order.customerPhone || ''}<br>${order.deliveryAddress || ''}</td></tr></table>
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<thead><tr style="background:#f5f3ff;"><th style="padding:9px;text-align:left;">Item</th><th style="padding:9px;">Qty</th><th style="padding:9px;text-align:right;">Price</th><th style="padding:9px;text-align:right;">Amount</th></tr></thead>
<tbody>${rows}</tbody></table>
<table style="width:100%;font-size:14px;margin-top:12px;">
<tr><td style="text-align:right;padding:4px;">Subtotal</td><td style="text-align:right;width:140px;padding:4px;">${naira(order.subtotal)}</td></tr>
${order.tierMultiplier && order.tierMultiplier !== 1 ? `<tr><td style="text-align:right;padding:4px;">${order.tierName} tier (×${order.tierMultiplier})</td><td style="text-align:right;padding:4px;">${naira(order.tierAmount)}</td></tr>` : ''}
${order.discount ? `<tr><td style="text-align:right;padding:4px;">Discount${order.couponApplied ? ' (' + order.couponApplied + ')' : ''}</td><td style="text-align:right;padding:4px;">−${naira(order.discount)}</td></tr>` : ''}
${order.vatAmount ? `<tr><td style="text-align:right;padding:4px;">${order.vatName || 'VAT'} (${order.vatRate}%)</td><td style="text-align:right;padding:4px;">${naira(order.vatAmount)}</td></tr>` : ''}
<tr><td style="text-align:right;padding:8px 4px;font-size:17px;font-weight:700;">Total</td><td style="text-align:right;padding:8px 4px;font-size:17px;font-weight:700;color:#7C3AED;">${naira(order.total)}</td></tr></table>
<p style="font-size:13px;color:#6b7280;">Payment: <b>${order.paymentMethod || ''}</b> — Status: <b>${(order.paymentStatus || 'pending').toUpperCase()}</b><br>
Service tier: <b>${order.tierName || ''}</b> · Expected ready: <b>${order.expectedDeliveryDate || ''}</b></p>
${showBank ? `<div style="background:#f5f3ff;border-radius:8px;padding:12px;font-size:13px;"><b>Bank transfer details</b><br>${s.bankName}<br>${s.bankAccountName}<br>Account No: <b>${s.bankAccountNumber}</b></div>` : ''}`;
}

export function orderEmailHtml(order, s) {
    return shell(`<p>Dear <b>${order.customerName || 'Valued Client'}</b>,</p>
<p>Thank you for choosing Couture dé Cywila. Your order has been received and your invoice is below.</p>
${invoiceHtml(order, s)}
<p style="margin-top:20px;"><a href="https://book.couturedecywila.com.ng" style="background:linear-gradient(135deg,#8B5CF6,#EC4899);color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Track my order</a></p>`);
}

export function adminOrderEmailHtml(order, s) {
    return shell(`<h3 style="margin-top:0;color:#7C3AED;">🔔 New order ${order.orderId}</h3>
<p>Source: <b>${order.source || 'Online'}</b>${order.createdBy ? ' (by ' + order.createdBy + ')' : ''}</p>
${invoiceHtml(order, s)}
<p><a href="https://admin.couturedecywila.com.ng">Open Admin Portal</a></p>`);
}

export const STATUS_MESSAGES = {
    'Received': 'We have received your order and it is in our queue.',
    'Pending': 'We have received your order and it is in our queue.',
    'Processing': 'Our team has started working on your order.',
    'Completed': 'Good news! Your order is completed and ready for pickup/delivery.',
    'Delivered': 'Your order has been delivered. Thank you for choosing Couture dé Cywila!'
};

export function statusEmailHtml(order) {
    return shell(`<p>Dear <b>${order.customerName || 'Valued Client'}</b>,</p>
<p>Your order <b>${order.orderId}</b> is now: <span style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#EC4899);color:#fff;padding:4px 12px;border-radius:20px;font-weight:700;">${order.status}</span></p>
<p>${STATUS_MESSAGES[order.status] || ''}</p>
<p style="color:#6b7280;font-size:13px;">Service tier: ${order.tierName || ''} · Expected: ${order.expectedDeliveryDate || ''}</p>`);
}

export function resetEmailHtml(name, code) {
    return shell(`<p>Dear <b>${name || 'Member'}</b>,</p>
<p>Use this code to reset your password/PIN. It expires in 15 minutes.</p>
<div style="text-align:center;font-size:34px;font-weight:800;letter-spacing:8px;color:#7C3AED;background:#f5f3ff;border-radius:10px;padding:16px;margin:18px 0;">${code}</div>
<p style="color:#6b7280;font-size:13px;">If you didn't request this, ignore this email.</p>`);
}

// ---------------------------------------------------------------- password reset codes
export async function createResetCode(kind, id) {
    const code = randomCode();
    const resets = await readKey('resets', {});
    resets[`${kind}:${id}`] = { hash: hashSecret(code), exp: Date.now() + 15 * 60000, tries: 0 };
    await writeKey('resets', resets);
    return code;
}

export async function consumeResetCode(kind, id, code) {
    const resets = await readKey('resets', {});
    const k = `${kind}:${id}`;
    const r = resets[k];
    if (!r || r.exp < Date.now() || r.tries >= 5) return false;
    if (!verifySecret(code, r.hash)) {
        r.tries++;
        await writeKey('resets', resets);
        return false;
    }
    delete resets[k];
    await writeKey('resets', resets);
    return true;
}
