/**
 * /api/settings — business configuration (VAT, bank details, business WhatsApp)
 *  GET  public (safe subset for customer invoice & checkout display)
 *  POST Admin / Manager: update business settings
 */
import {
    json, preflight, readBody, readKey, writeKey, requireUser, DEFAULT_SETTINGS
} from '../lib/core.mjs';

export default async (req) => {
    if (req.method === 'OPTIONS') return preflight();

    try {
        let settings = await readKey('settings', null);
        if (!settings) {
            settings = DEFAULT_SETTINGS;
            await writeKey('settings', settings);
        }

        if (req.method === 'GET') {
            return json({ success: true, settings });
        }

        if (req.method === 'POST' || req.method === 'PUT') {
            const who = requireUser(req, ['Super Admin', 'Admin', 'Manager']);
            if (!who) return json({ error: 'Unauthorized: Admin privileges required' }, 403);

            const b = await readBody(req);
            settings = {
                ...settings,
                businessName: b.businessName !== undefined ? String(b.businessName).trim() : settings.businessName,
                businessEmail: b.businessEmail !== undefined ? String(b.businessEmail).trim() : settings.businessEmail,
                businessPhone: b.businessPhone !== undefined ? String(b.businessPhone).trim() : settings.businessPhone,
                businessWhatsapp: b.businessWhatsapp !== undefined ? String(b.businessWhatsapp).trim() : settings.businessWhatsapp,
                businessAddress: b.businessAddress !== undefined ? String(b.businessAddress).trim() : settings.businessAddress,
                vatEnabled: Boolean(b.vatEnabled),
                vatRate: Number(b.vatRate) >= 0 ? Number(b.vatRate) : 7.5,
                vatName: b.vatName !== undefined ? String(b.vatName).trim() : 'VAT',
                bankName: b.bankName !== undefined ? String(b.bankName).trim() : settings.bankName,
                bankAccountName: b.bankAccountName !== undefined ? String(b.bankAccountName).trim() : settings.bankAccountName,
                bankAccountNumber: b.bankAccountNumber !== undefined ? String(b.bankAccountNumber).trim() : settings.bankAccountNumber,
                flutterwavePublicKey: b.flutterwavePublicKey !== undefined ? String(b.flutterwavePublicKey).trim() : (settings.flutterwavePublicKey || ''),
                paystackPublicKey: b.paystackPublicKey !== undefined ? String(b.paystackPublicKey).trim() : (settings.paystackPublicKey || '')
            };

            await writeKey('settings', settings);
            return json({ success: true, settings });
        }

        return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
        console.error('[settings API]', err);
        return json({ error: 'Settings error: ' + err.message }, 500);
    }
};
