/**
 * Couture dé Cywila - Enterprise Ecosystem Navigation Bar
 * Injects a discreet top bar into all apps to enable effortless navigation between departments.
 */
(function() {
    window.addEventListener('DOMContentLoaded', function() {
        var existingBar = document.getElementById('couture-ecosystem-nav');
        if (existingBar) return;

        var nav = document.createElement('div');
        nav.id = 'couture-ecosystem-nav';
        nav.innerHTML = `
            <div class="c-eco-container">
                <div class="c-eco-brand">
                    <span class="c-eco-logo">Couture dé Cywila</span>
                    <span class="c-eco-tag">Enterprise Suite</span>
                </div>
                <div class="c-eco-links">
                    <a href="/" class="c-eco-link">🏠 Website</a>
                    <a href="/portal/" class="c-eco-link c-eco-portal">⚡ Portal Hub</a>
                    <a href="/shop/" class="c-eco-link">🛍️ Shop</a>
                    <a href="/admin/" class="c-eco-link">👑 Admin</a>
                    <a href="/staff/" class="c-eco-link">✂️ Staff</a>
                    <a href="/accounting/" class="c-eco-link">📊 Accounting</a>
                    <a href="/notifications/" class="c-eco-link">🔔 Notifications</a>
                    <a href="/loyalty/" class="c-eco-link">💎 Loyalty</a>
                </div>
            </div>
        `;

        var style = document.createElement('style');
        style.textContent = `
            #couture-ecosystem-nav {
                background: #0d0d14;
                border-bottom: 1px solid #2d3561;
                padding: 0.5rem 1rem;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 0.82rem;
                position: sticky;
                top: 0;
                z-index: 99999;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            }
            .c-eco-container {
                max-width: 1400px;
                margin: 0 auto;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 0.5rem;
            }
            .c-eco-brand {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .c-eco-logo {
                color: #C8A96A;
                font-weight: 700;
                letter-spacing: 0.5px;
            }
            .c-eco-tag {
                background: rgba(200, 169, 106, 0.15);
                color: #C8A96A;
                padding: 0.15rem 0.4rem;
                border-radius: 4px;
                font-size: 0.72rem;
                font-weight: 600;
                text-transform: uppercase;
            }
            .c-eco-links {
                display: flex;
                align-items: center;
                gap: 0.35rem;
                flex-wrap: wrap;
            }
            .c-eco-link {
                color: #b0b4c8;
                text-decoration: none;
                padding: 0.3rem 0.6rem;
                border-radius: 6px;
                transition: all 0.2s ease;
                font-weight: 500;
                white-space: nowrap;
            }
            .c-eco-link:hover {
                color: #fff;
                background: #1e2640;
            }
            .c-eco-portal {
                background: linear-gradient(135deg, #FF6B35, #D4AF37);
                color: #fff !important;
                font-weight: 600;
            }
            .c-eco-portal:hover {
                opacity: 0.9;
                transform: translateY(-1px);
            }
            @media (max-width: 768px) {
                #couture-ecosystem-nav { font-size: 0.75rem; padding: 0.4rem 0.5rem; }
                .c-eco-brand { display: none; }
                .c-eco-links { justify-content: center; width: 100%; gap: 0.2rem; }
                .c-eco-link { padding: 0.25rem 0.4rem; }
            }
        `;

        document.head.appendChild(style);
        document.body.insertBefore(nav, document.body.firstChild);
    });
})();
