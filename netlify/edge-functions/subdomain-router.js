/**
 * Netlify Edge Function: subdomain-router
 * Routes incoming subdomains seamlessly to their respective portals:
 * - book.couturedecywila.com.ng  -> /shop/index.html
 * - admin.couturedecywila.com.ng -> /admin/index.html
 * - staff.couturedecywila.com.ng -> /staff/index.html
 * - couturedecywila.com.ng       -> /index.html (Brand website only)
 */

export default async (request, context) => {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();

    // 1. Bypass all serverless API endpoints and Netlify system paths
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/.netlify')) {
        return context.next();
    }

    // 2. Booking Subdomain: book.couturedecywila.com.ng
    if (hostname.startsWith('book.')) {
        if (url.pathname === '/' || url.pathname === '') {
            return context.rewrite('/shop/index.html');
        }
        if (!url.pathname.startsWith('/shop') && 
            !url.pathname.startsWith('/shared') && 
            !url.pathname.startsWith('/images') && 
            !url.pathname.endsWith('.css') && 
            !url.pathname.endsWith('.js') && 
            !url.pathname.endsWith('.svg') && 
            !url.pathname.endsWith('.png') && 
            !url.pathname.endsWith('.jpg')) {
            return context.rewrite(`/shop${url.pathname}`);
        }
        return context.next();
    }

    // 3. Admin Subdomain: admin.couturedecywila.com.ng
    if (hostname.startsWith('admin.')) {
        if (url.pathname === '/' || url.pathname === '') {
            return context.rewrite('/admin/index.html');
        }
        if (!url.pathname.startsWith('/admin') && 
            !url.pathname.startsWith('/shared') && 
            !url.pathname.startsWith('/images') && 
            !url.pathname.endsWith('.css') && 
            !url.pathname.endsWith('.js') && 
            !url.pathname.endsWith('.svg') && 
            !url.pathname.endsWith('.png') && 
            !url.pathname.endsWith('.jpg')) {
            return context.rewrite(`/admin${url.pathname}`);
        }
        return context.next();
    }

    // 4. Staff Subdomain: staff.couturedecywila.com.ng
    if (hostname.startsWith('staff.')) {
        if (url.pathname === '/' || url.pathname === '') {
            return context.rewrite('/staff/index.html');
        }
        if (!url.pathname.startsWith('/staff') && 
            !url.pathname.startsWith('/shared') && 
            !url.pathname.startsWith('/images') && 
            !url.pathname.endsWith('.css') && 
            !url.pathname.endsWith('.js') && 
            !url.pathname.endsWith('.svg') && 
            !url.pathname.endsWith('.png') && 
            !url.pathname.endsWith('.jpg')) {
            return context.rewrite(`/staff${url.pathname}`);
        }
        return context.next();
    }

    // 5. Main Domain: couturedecywila.com.ng
    // Redirect internal portal paths if accessed on the main domain directly
    if (url.pathname.startsWith('/shop')) {
        return Response.redirect('https://book.couturedecywila.com.ng', 301);
    }
    if (url.pathname.startsWith('/admin')) {
        return Response.redirect('https://admin.couturedecywila.com.ng', 301);
    }
    if (url.pathname.startsWith('/staff')) {
        return Response.redirect('https://staff.couturedecywila.com.ng', 301);
    }

    return context.next();
};
