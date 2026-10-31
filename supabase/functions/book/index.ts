// Supabase Edge Function: create a booking after verifying payment.
// Secrets (set with `supabase secrets set ...`):
//   PAYSTACK_SECRET_KEY   sk_test_… / sk_live_… (never put this in frontend code)
//   PAYSTACK_CURRENCY     optional, defaults to GHS
//   ALLOW_DEMO_PAYMENTS   "true" to allow bookings without Paystack (testing only)
//   ALLOWED_ORIGIN        optional, comma-separated, e.g. https://istudiorecords.space,https://istudiorecordx.netlify.app (defaults to *)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleBook, verifyPaystack } from '../_shared/booking.mjs';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGIN') ?? '*').split(',').map(o => o.trim()).filter(Boolean);

// Echo the caller's origin when it is on the list (a site served from both
// *.netlify.app and a custom domain needs both allowed).
function corsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? '';
    const allow = allowedOrigins.includes('*') ? '*' : allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin'
    };
}

Deno.serve(async (req) => {
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

    const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } }
    );

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData } = token ? await admin.auth.getUser(token) : { data: { user: null } };

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return json(400, { error: 'Invalid JSON body.' });
    }

    const env = {
        PAYSTACK_SECRET_KEY: Deno.env.get('PAYSTACK_SECRET_KEY'),
        PAYSTACK_CURRENCY: Deno.env.get('PAYSTACK_CURRENCY'),
        ALLOW_DEMO_PAYMENTS: Deno.env.get('ALLOW_DEMO_PAYMENTS')
    };

    const result = await handleBook(body, {
        user: userData?.user ?? null,
        env,
        verifyPayment: (ref: string) => verifyPaystack(ref, env.PAYSTACK_SECRET_KEY!),
        createBooking: async (params: Record<string, unknown>) => {
            const { data, error } = await admin.rpc('create_booking', params);
            if (error) throw Object.assign(new Error(error.message), { code: error.code });
            return data;
        },
        logIssue: async (issue: Record<string, unknown>) => {
            const { error } = await admin.from('payment_issues').insert(issue);
            if (error) throw error;
        }
    });

    return json(result.status, result.body);
});
