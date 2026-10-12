/**
 * Netlify Serverless Function: payment-config
 * Safely exposes only the public keys from Netlify's server environment variables
 * to the browser without exposing secret keys or hardcoding anything.
 */

exports.handler = async function(event, context) {
    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    const flutterwaveKey = process.env.FLUTTERWAVE_PUBLIC_KEY || process.env.FLW_PUBLIC_KEY || '';
    const paystackKey = process.env.PAYSTACK_PUBLIC_KEY || process.env.PAYSTACK_KEY || '';

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store, max-age=0'
        },
        body: JSON.stringify({
            flutterwavePublicKey: flutterwaveKey,
            paystackPublicKey: paystackKey,
            hasFlutterwave: !!flutterwaveKey,
            hasPaystack: !!paystackKey
        })
    };
};
