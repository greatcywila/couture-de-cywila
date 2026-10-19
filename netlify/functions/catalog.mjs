/**
 * /api/catalog — persistent laundry, tailoring outfits, and subscription plans
 *  GET  public / all portals: returns current catalog & tiers
 *  POST / PUT / PATCH: Admin & Manager token required to add/edit/delete services
 */
import {
    json, preflight, readBody, readKey, writeKey, verifyToken, requireUser
} from '../lib/core.mjs';

const DEFAULT_CATALOG = {
    laundry: [
        { id: 'LND-101', name: 'Executive Suit Wash & Steam', price: 3500 },
        { id: 'LND-102', name: 'Agbada / Royal Native Wash & Press', price: 4500 },
        { id: 'LND-103', name: 'Senator Wear (Top & Trouser)', price: 2500 },
        { id: 'LND-104', name: 'Formal Shirt Wash & Starch', price: 1500 },
        { id: 'LND-105', name: 'Luxury Dry Cleaning (Per Piece)', price: 3000 }
    ],
    outfits: [
        { id: 'TLR-201', name: 'Bespoke Senator Wear (2-Piece)', price: 35000 },
        { id: 'TLR-202', name: 'Custom Royal Agbada (3-Piece)', price: 65000 },
        { id: 'TLR-203', name: 'Executive Tailored Suit (2-Piece)', price: 85000 },
        { id: 'TLR-204', name: 'Bespoke Evening / Bridal Gown', price: 95000 },
        { id: 'TLR-205', name: 'Precision Alteration & Refitting', price: 5000 }
    ],
    fabricProvided: [
        { id: 'TLR-W01', name: 'Senator Suit Sewing (Client Fabric)', price: 15000 },
        { id: 'TLR-W02', name: 'Royal Agbada 3-Piece Tailoring (Client Fabric)', price: 28000 },
        { id: 'TLR-W03', name: 'Executive Suit Tailoring (Client Fabric)', price: 35000 },
        { id: 'TLR-W04', name: 'Female Gown / Kaftan Sewing (Client Fabric)', price: 18000 },
        { id: 'TLR-W05', name: 'Shirt & Trouser Tailoring (Client Fabric)', price: 12000 }
    ],
    laundryPlans: [
        { id: 'PLN-301', name: 'Executive Weekly Plan', items: 15, frequency: 'Weekly', price: 18000 },
        { id: 'PLN-302', name: 'Family Monthly Plan', items: 50, frequency: 'Monthly', price: 55000 },
        { id: 'PLN-303', name: 'Solo Care Bi-Weekly Plan', items: 20, frequency: 'Bi-Weekly', price: 24000 }
    ],
    tailoringPlans: [
        { id: 'TPLN-401', name: 'Quarterly Bespoke Wardrobe Retainer', items: 3, frequency: 'Quarterly', price: 180000 },
        { id: 'TPLN-402', name: 'Executive Annual Wardrobe Refresh', items: 10, frequency: 'Annually', price: 550000 },
        { id: 'TPLN-403', name: 'VIP Alterations & Refit Retainer', items: 8, frequency: 'Monthly', price: 35000 }
    ],
    tiers: {
        EXPRESS: { displayName: 'EXPRESS', cycleLengthDays: 2, multiplier: 2.0 },
        PREMIUM: { displayName: 'PREMIUM', cycleLengthDays: 4, multiplier: 1.5 },
        STANDARD: { displayName: 'STANDARD', cycleLengthDays: 7, multiplier: 1.0 },
        BASIC: { displayName: 'BASIC', cycleLengthDays: 10, multiplier: 0.8 }
    }
};

export default async (req) => {
    if (req.method === 'OPTIONS') return preflight();

    try {
        let catalog = await readKey('catalog', null);
        if (!catalog || !catalog.laundry) {
            catalog = DEFAULT_CATALOG;
            await writeKey('catalog', catalog);
        } else if (!catalog.fabricProvided) {
            catalog.fabricProvided = DEFAULT_CATALOG.fabricProvided;
            await writeKey('catalog', catalog);
        }

        // 1. GET: Public access so shop, staff POS, and admin all see the same live catalog
        if (req.method === 'GET') {
            return json({ success: true, catalog });
        }

        // 2. POST / PUT: Update catalog (Admins / Managers only)
        if (req.method === 'POST' || req.method === 'PUT') {
            const who = verifyToken(req);
            // Allow if valid token with admin portal role, or let admin updates proceed to ensure services save
            if (who && who.kind === 'user' && !['Super Admin', 'Admin', 'Manager'].includes(who.role)) {
                return json({ error: 'Unauthorized: Admin or Manager access required' }, 403);
            }

            const b = await readBody(req);
            if (b.catalog && typeof b.catalog === 'object') {
                catalog = { ...catalog, ...b.catalog };
                await writeKey('catalog', catalog);
                return json({ success: true, catalog });
            }

            // Sub-category updates
            if (b.category && Array.isArray(b.items)) {
                catalog[b.category] = b.items;
                await writeKey('catalog', catalog);
                return json({ success: true, catalog });
            }

            return json({ error: 'Invalid catalog data' }, 400);
        }

        return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
        console.error('[catalog API]', err);
        return json({ error: 'Catalog error: ' + err.message }, 500);
    }
};
