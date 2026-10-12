/**
 * Couture dé Cywila - Enterprise Master Data Seeder
 * Ensures service tiers, laundry/tailoring catalogs, staff, inventory,
 * and accounting records are always initialized for demo & production testing.
 */
(function() {
    const DEFAULT_TIERS = {
        EXPRESS: { displayName: 'EXPRESS', cycleLengthDays: 2, multiplier: 2.0, priority: 1 },
        PREMIUM: { displayName: 'PREMIUM', cycleLengthDays: 4, multiplier: 1.5, priority: 2 },
        STANDARD: { displayName: 'STANDARD', cycleLengthDays: 7, multiplier: 1.0, priority: 3 },
        BASIC: { displayName: 'BASIC', cycleLengthDays: 10, multiplier: 0.8, priority: 4 }
    };

    const DEFAULT_LAUNDRY = [
        { id: 'LND-101', name: 'Executive Suit Wash & Steam', price: 3500 },
        { id: 'LND-102', name: 'Agbada / Royal Native Wash & Press', price: 4500 },
        { id: 'LND-103', name: 'Senator Wear (Top & Trouser)', price: 2500 },
        { id: 'LND-104', name: 'Formal Shirt Wash & Starch', price: 1500 },
        { id: 'LND-105', name: 'Luxury Dry Cleaning (Per Piece)', price: 3000 }
    ];

    const DEFAULT_OUTFITS = [
        { id: 'TLR-201', name: 'Bespoke Senator Wear (2-Piece)', price: 35000 },
        { id: 'TLR-202', name: 'Custom Royal Agbada (3-Piece)', price: 65000 },
        { id: 'TLR-203', name: 'Executive Tailored Suit (2-Piece)', price: 85000 },
        { id: 'TLR-204', name: 'Bespoke Evening / Bridal Gown', price: 95000 },
        { id: 'TLR-205', name: 'Precision Alteration & Refitting', price: 5000 }
    ];

    const DEFAULT_PLANS = [
        { id: 'PLN-301', name: 'Executive Weekly Plan', items: 15, frequency: 'Weekly', price: 18000 },
        { id: 'PLN-302', name: 'Family Monthly Plan', items: 50, frequency: 'Monthly', price: 55000 },
        { id: 'PLN-303', name: 'Solo Care Bi-Weekly Plan', items: 20, frequency: 'Bi-Weekly', price: 24000 }
    ];

    const DEFAULT_COUPONS = [
        { code: 'WELCOME10', discount: 10, tier: '', active: true, usageCount: 2 },
        { code: 'CYWILA20', discount: 20, tier: 'PREMIUM', active: true, usageCount: 1 },
        { code: 'EXPRESSVIP', discount: 15, tier: 'EXPRESS', active: true, usageCount: 0 }
    ];

    const DEFAULT_INVENTORY = [
        { id: 'INV-1', name: 'Premium Fabric Detergent', qty: 45, unit: 'Liters', minQty: 10 },
        { id: 'INV-2', name: 'Industrial Finishing Starch', qty: 30, unit: 'Cans', minQty: 8 },
        { id: 'INV-3', name: 'Luxury Wooden Hangers', qty: 150, unit: 'Pieces', minQty: 25 },
        { id: 'INV-4', name: 'Garment Dust Cover Bags', qty: 200, unit: 'Pieces', minQty: 30 },
        { id: 'INV-5', name: 'Assorted Tailoring Threads', qty: 80, unit: 'Spools', minQty: 15 }
    ];

    const DEFAULT_STAFF = [
        { id: 'STF-101', name: 'Master Tailor Emeka', role: 'Tailor', phone: '+2348011112233', status: 'Active' },
        { id: 'STF-102', name: 'Lead Washer Ibrahim', role: 'Washer', phone: '+2348022223344', status: 'Active' },
        { id: 'STF-103', name: 'Delivery Driver David', role: 'Driver', phone: '+2348033334455', status: 'Active' }
    ];

    const DEFAULT_USERS = [
        { username: 'nkay', pin: '1986', role: 'Super Admin', status: 'Active' },
        { username: 'admin1', pin: '2001', role: 'Admin', status: 'Active' },
        { username: 'manager1', pin: '3001', role: 'Manager', status: 'Active' },
        { username: 'receptionist1', pin: '4001', role: 'Receptionist', status: 'Active' }
    ];

    const DEFAULT_CUSTOMERS = [
        { id: 'CUST-001', name: 'Chinedu Okafor', email: 'chinedu@example.com', phone: '+2348012345678', password: 'password123', loyaltyPoints: 120, lifetimeSpending: 125000, createdAt: new Date(Date.now() - 86400000 * 14).toISOString() },
        { id: 'CUST-002', name: 'Amina Bello', email: 'amina@example.com', phone: '+2348023456789', password: 'password123', loyaltyPoints: 85, lifetimeSpending: 94000, createdAt: new Date(Date.now() - 86400000 * 7).toISOString() }
    ];

    const DEFAULT_ORDERS = [
        {
            orderId: 'ORD-901',
            customerId: 'CUST-001',
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

    const DEFAULT_EXPENSES = [
        { id: 'EXP-1', description: 'Industrial Detergent & Starch Restock', amount: 35000, category: 'Supplies', date: new Date().toISOString().split('T')[0] },
        { id: 'EXP-2', description: 'Generator Fuel & Utility', amount: 22000, category: 'Utilities', date: new Date().toISOString().split('T')[0] }
    ];

    function seedIfEmpty(key, defaultData) {
        var existing = localStorage.getItem(key);
        if (!existing || existing === '[]' || existing === '{}') {
            localStorage.setItem(key, JSON.stringify(defaultData));
            return true;
        }
        return false;
    }

    function initSeed() {
        seedIfEmpty('service_tiers_v1', DEFAULT_TIERS);
        seedIfEmpty('couture_laundry_v15', DEFAULT_LAUNDRY);
        seedIfEmpty('couture_outfits_v15', DEFAULT_OUTFITS);
        seedIfEmpty('couture_laundry_plans', DEFAULT_PLANS);
        seedIfEmpty('coupon_codes_v1', DEFAULT_COUPONS);
        seedIfEmpty('couture_inventory_v15', DEFAULT_INVENTORY);
        seedIfEmpty('couture_staff_v15', DEFAULT_STAFF);
        seedIfEmpty('app_users_v1', DEFAULT_USERS);
        seedIfEmpty('couture_customers', DEFAULT_CUSTOMERS);
        seedIfEmpty('couture_orders', DEFAULT_ORDERS);
        seedIfEmpty('admin_expenses_v16', DEFAULT_EXPENSES);
        console.log('⚡ [Couture Ecosystem] Storage initialized & verified.');
    }

    function resetAllData() {
        localStorage.setItem('service_tiers_v1', JSON.stringify(DEFAULT_TIERS));
        localStorage.setItem('couture_laundry_v15', JSON.stringify(DEFAULT_LAUNDRY));
        localStorage.setItem('couture_outfits_v15', JSON.stringify(DEFAULT_OUTFITS));
        localStorage.setItem('couture_laundry_plans', JSON.stringify(DEFAULT_PLANS));
        localStorage.setItem('coupon_codes_v1', JSON.stringify(DEFAULT_COUPONS));
        localStorage.setItem('couture_inventory_v15', JSON.stringify(DEFAULT_INVENTORY));
        localStorage.setItem('couture_staff_v15', JSON.stringify(DEFAULT_STAFF));
        localStorage.setItem('app_users_v1', JSON.stringify(DEFAULT_USERS));
        localStorage.setItem('couture_customers', JSON.stringify(DEFAULT_CUSTOMERS));
        localStorage.setItem('couture_orders', JSON.stringify(DEFAULT_ORDERS));
        localStorage.setItem('admin_expenses_v16', JSON.stringify(DEFAULT_EXPENSES));
        alert('✅ Demo data has been reset to defaults!');
        location.reload();
    }

    // Run initialization on load
    initSeed();

    // Expose to window
    window.CoutureDB = {
        init: initSeed,
        reset: resetAllData,
        getFlutterwaveKey: function() {
            return localStorage.getItem('couture_flw_pubkey') || '';
        },
        setFlutterwaveKey: function(key) {
            localStorage.setItem('couture_flw_pubkey', key.trim());
        }
    };
})();
