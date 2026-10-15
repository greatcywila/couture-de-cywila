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
            // Merge environment variables set directly in Netlify dashboard if not overridden in stored settings
            const envFlutterwave = process.env.FLUTTERWAVE_PUBLIC_KEY || process.env.FLW_PUBLIC_KEY || '';
            const envPaystack = process.env.PAYSTACK_PUBLIC_KEY || process.env.PAYSTACK_KEY || '';
            const merged = {
                ...DEFAULT_SETTINGS,
                ...settings,
                flutterwavePublicKey: settings.flutterwavePublicKey || envFlutterwave,
                paystackPublicKey: settings.paystackPublicKey || envPaystack
            };
            return json({ success: true, settings: merged });
        }

        if (req.method === 'POST' || req.method === 'PUT') {
            const who = requireUser(req, ['Super Admin', 'Admin', 'Manager']);
            if (!who) return json({ error: 'Unauthorized: Admin privileges required' }, 403);

            const b = await readBody(req);
            settings = {
                ...settings,
                businessName: b.businessName !== undefined ? String(b.businessName).trim() : settings.businessName,
                businessEmail: (b.businessEmail !== undefined ? b.businessEmail : b.supportEmail) !== undefined ? String(b.businessEmail || b.supportEmail).trim() : settings.businessEmail,
                businessPhone: b.businessPhone !== undefined ? String(b.businessPhone).trim() : settings.businessPhone,
                businessWhatsapp: (b.businessWhatsapp !== undefined ? b.businessWhatsapp : b.whatsapp) !== undefined ? String(b.businessWhatsapp || b.whatsapp).trim() : settings.businessWhatsapp,
                businessAddress: b.businessAddress !== undefined ? String(b.businessAddress).trim() : settings.businessAddress,
                vatEnabled: Boolean(b.vatEnabled),
                vatRate: Number(b.vatRate) >= 0 ? Number(b.vatRate) : 7.5,
                vatName: b.vatName !== undefined ? String(b.vatName).trim() : 'VAT',
                bankName: b.bankName !== undefined ? String(b.bankName).trim() : settings.bankName,
                bankAccountName: (b.bankAccountName !== undefined ? b.bankAccountName : b.accountName) !== undefined ? String(b.bankAccountName || b.accountName).trim() : settings.bankAccountName,
                bankAccountNumber: (b.bankAccountNumber !== undefined ? b.bankAccountNumber : b.bankAccount) !== undefined ? String(b.bankAccountNumber || b.bankAccount).trim() : settings.bankAccountNumber,
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
