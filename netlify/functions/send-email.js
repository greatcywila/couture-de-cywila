/**
 * Netlify Serverless Function: send-email
 * Powered by Resend (https://resend.com)
 * Handles:
 * 1. Automated order confirmation to customer & instant alert to Admin
 * 2. Secure 6-digit password/PIN recovery codes for Customers and Staff
 */

exports.handler = async function(event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const resendApiKey = process.env.RESEND_API_KEY || '';
        const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'greatcywila@gmail.com';
        const senderEmail = process.env.RESEND_SENDER_EMAIL || 'orders@couturedecywila.com.ng';

        const postToResend = async (payload) => {
            return fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        };

        // ==========================================
        // TYPE 1: PASSWORD / PIN RECOVERY EMAIL
        // ==========================================
        if (body.type === 'password_reset') {
            const { email, recipientName, resetCode, role } = body;

            if (!email || !resetCode) {
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'Email and resetCode are required' })
                };
            }

            if (!resendApiKey) {
                console.log(`[Resend Mock Mode] Reset code for ${email}: ${resetCode}`);
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ success: true, message: 'Recovery code dispatched (mock mode)', code: resetCode })
                };
            }

            const resetPayload = {
                from: `Couture dé Cywila <${senderEmail}>`,
                to: [email],
                reply_to: adminEmail,
                subject: `🔒 Password Reset Code: ${resetCode} | Couture dé Cywila`,
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 550px; margin: 0 auto; background: #ffffff; padding: 32px 24px; border: 1px solid #e8e8e8; border-radius: 10px;">
                        <div style="text-align: center; border-bottom: 2px solid #C8A96A; padding-bottom: 20px; margin-bottom: 24px;">
                            <h1 style="color: #0D0D0D; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">Couture dé Cywila</h1>
                            <p style="color: #C8A96A; margin: 6px 0 0; font-size: 13px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;">Security Desk</p>
                        </div>
                        <p style="font-size: 16px; color: #111;">Dear <strong>${recipientName || 'Valued Member'}</strong>,</p>
                        <p style="color: #555; line-height: 1.6; font-size: 15px;">We received a request to reset your ${role || 'account'} password/PIN. Use the secure 6-digit verification code below to proceed:</p>
                        <div style="background: #faf8f5; border: 2px dashed #C8A96A; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0;">
                            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0D0D0D;">${resetCode}</span>
                            <p style="margin: 8px 0 0; font-size: 13px; color: #888;">Valid for the next 15 minutes</p>
                        </div>
                        <p style="color: #777; font-size: 13px; line-height: 1.5;">If you did not make this request, you can safely ignore this email. Your account remains secure.</p>
                        <div style="text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 13px;">
                            <p style="margin: 0;">&copy; 2026 Couture dé Cywila. All rights reserved.</p>
                        </div>
                    </div>
                `
            };

            const sendRes = await postToResend(resetPayload);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: true, status: sendRes.status })
            };
        }

        // ==========================================
        // TYPE 2: ORDER CONFIRMATION EMAILS
        // ==========================================
        const {
            orderId,
            customerName,
            customerEmail,
            customerPhone,
            items,
            tierName,
            total,
            deliveryAddress,
            expectedDeliveryDate
        } = body;

        if (!resendApiKey) {
            console.log('[Resend] API key not yet set in environment. Skipping email dispatch.');
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ message: 'Email skipped: RESEND_API_KEY not configured' })
            };
        }

        // Format items table HTML
        let itemsHtml = (items || []).map(i => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; color: #333;">${i.name || 'Service'}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; text-align: center; color: #666;">${i.quantity || 1}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; text-align: right; color: #111; font-weight: 600;">₦${((i.price || 0) * (i.quantity || 1)).toLocaleString()}</td>
            </tr>
        `).join('');

        // 1. Customer Confirmation Email
        const customerPayload = {
            from: `Couture dé Cywila <${senderEmail}>`,
            to: [customerEmail],
            reply_to: adminEmail,
            subject: `Order Confirmation #${orderId} | Couture dé Cywila`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 32px 24px; border: 1px solid #e8e8e8; border-radius: 10px;">
                    <div style="text-align: center; border-bottom: 2px solid #C8A96A; padding-bottom: 20px; margin-bottom: 24px;">
                        <h1 style="color: #0D0D0D; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">Couture dé Cywila</h1>
                        <p style="color: #C8A96A; margin: 6px 0 0; font-size: 13px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;">Quiet Power. Clean Execution.</p>
                    </div>

                    <p style="font-size: 16px; color: #111; margin-bottom: 16px;">Dear <strong>${customerName}</strong>,</p>
                    <p style="color: #555; line-height: 1.6; font-size: 15px;">Your order has been successfully placed and accepted into our <strong>${tierName}</strong> production schedule.</p>

                    <div style="background: #faf8f5; border: 1px solid #f0e6d6; border-radius: 8px; padding: 18px; margin: 24px 0;">
                        <p style="margin: 0 0 10px; font-size: 14px; color: #666;">Order Reference: <strong style="color: #111;">${orderId}</strong></p>
                        <p style="margin: 0 0 10px; font-size: 14px; color: #666;">Service Tier: <strong style="color: #C8A96A;">${tierName}</strong></p>
                        <p style="margin: 0 0 10px; font-size: 14px; color: #666;">Expected Delivery: <strong style="color: #111;">${expectedDeliveryDate || 'Standard Schedule'}</strong></p>
                        <p style="margin: 0; font-size: 14px; color: #666;">Delivery Address: <strong style="color: #111;">${deliveryAddress || 'Showroom Pickup'}</strong></p>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
                        <thead>
                            <tr style="background: #f5f5f5; border-bottom: 2px solid #e0e0e0;">
                                <th style="padding: 10px; text-align: left; color: #444;">Service</th>
                                <th style="padding: 10px; text-align: center; color: #444;">Qty</th>
                                <th style="padding: 10px; text-align: right; color: #444;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                            <tr style="background: #fffdfa;">
                                <td colspan="2" style="padding: 14px 10px; font-weight: 700; font-size: 16px; color: #111;">Total Amount</td>
                                <td style="padding: 14px 10px; font-weight: 700; font-size: 16px; text-align: right; color: #C8A96A;">₦${(total || 0).toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style="text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 13px;">
                        <p style="margin: 0 0 6px;">Questions about your order? Reach our executive desk on WhatsApp: <strong>+234 815 555 9954</strong></p>
                        <p style="margin: 0;">&copy; 2026 Couture dé Cywila. All rights reserved.</p>
                    </div>
                </div>
            `
        };

        // 2. Admin Alert Email
        const adminPayload = {
            from: `Couture Alerts <${senderEmail}>`,
            to: [adminEmail],
            reply_to: customerEmail || adminEmail,
            subject: `🔔 New Order Placed: #${orderId} (${tierName}) - ₦${(total || 0).toLocaleString()}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #fdfdfd; border: 1px solid #ddd; border-radius: 8px;">
                    <h2 style="color: #C8A96A; margin-top: 0;">New Client Order Received</h2>
                    <p>A new order has just been placed on <strong>couturedecywila.com.ng</strong>.</p>
                    <table style="width: 100%; font-size: 14px; line-height: 1.8;">
                        <tr><td><strong>Order ID:</strong></td><td>${orderId}</td></tr>
                        <tr><td><strong>Customer Name:</strong></td><td>${customerName}</td></tr>
                        <tr><td><strong>Email:</strong></td><td>${customerEmail}</td></tr>
                        <tr><td><strong>Phone:</strong></td><td>${customerPhone || 'N/A'}</td></tr>
                        <tr><td><strong>Tier:</strong></td><td>${tierName}</td></tr>
                        <tr><td><strong>Total:</strong></td><td><strong>₦${(total || 0).toLocaleString()}</strong></td></tr>
                        <tr><td><strong>Delivery Address:</strong></td><td>${deliveryAddress}</td></tr>
                    </table>
                    <div style="margin-top: 24px;">
                        <a href="https://admin.couturedecywila.com.ng" style="background: #16213e; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; display: inline-block;">Open Admin Portal</a>
                    </div>
                </div>
            `
        };

        const [custRes, adminRes] = await Promise.all([
            postToResend(customerPayload),
            postToResend(adminPayload)
        ]);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                customerStatus: custRes.status,
                adminStatus: adminRes.status
            })
        };
    } catch (err) {
        console.error('[Resend Error]', err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: err.message })
        };
    }
};
