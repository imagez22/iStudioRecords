// Core logic for the `book` Edge Function. Plain JS with injected
// dependencies so it runs under Deno (Supabase) and Node (tests).

export const SESSION_TYPES = [
    'Recording Session',
    'Mixing & Mastering',
    'Beat Production',
    'Podcast / Voice-Over',
    'Band Rehearsal'
];

const REF_PATTERN = /^[A-Za-z0-9._=-]{6,100}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function reply(status, body) {
    return { status, body };
}

/** Validate the request body; returns { ok, value } or { ok:false, error }. */
export function parseBookingRequest(body) {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
    const v = {
        studioId: String(body.studioId || ''),
        sessionType: String(body.sessionType || ''),
        date: String(body.date || ''),
        startHour: Number(body.startHour),
        hours: Number(body.hours),
        engineer: body.engineer === true,
        userName: String(body.userName || '').trim().slice(0, 60),
        phone: String(body.phone || '').trim(),
        notes: String(body.notes || '').trim().slice(0, 500),
        reference: String(body.reference || '')
    };
    if (!v.studioId) return { ok: false, error: 'Please choose a studio.' };
    if (!SESSION_TYPES.includes(v.sessionType)) return { ok: false, error: 'Please choose a session type.' };
    if (!DATE_PATTERN.test(v.date)) return { ok: false, error: 'Please choose a date.' };
    if (!Number.isInteger(v.startHour) || !Number.isInteger(v.hours)) return { ok: false, error: 'Please choose a time.' };
    if (!/^\+?[0-9\s-]{9,16}$/.test(v.phone)) return { ok: false, error: 'Please enter a valid phone number.' };
    if (!REF_PATTERN.test(v.reference)) return { ok: false, error: 'Missing or invalid payment reference.' };
    return { ok: true, value: v };
}

/** Call Paystack's verify endpoint. `fetchImpl` is injectable for tests. */
export async function verifyPaystack(reference, secretKey, fetchImpl = fetch) {
    const res = await fetchImpl(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secretKey}` }
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.status || !json.data) {
        return { ok: false, error: json.message || 'Could not verify payment.' };
    }
    return {
        ok: json.data.status === 'success',
        error: json.data.status === 'success' ? null : `Payment ${json.data.status || 'failed'}.`,
        amount: Number(json.data.amount) / 100,          // pesewas → cedis
        currency: json.data.currency,
        email: String(json.data.customer?.email || '').toLowerCase(),
        reference: json.data.reference
    };
}

/**
 * Handle a booking request.
 * deps: { user, env, verifyPayment(ref), createBooking(params), logIssue(issue) }
 */
export async function handleBook(body, deps) {
    const { user, env = {} } = deps;
    if (!user || !user.id) return reply(401, { error: 'Please sign in to book.' });

    const parsed = parseBookingRequest(body);
    if (!parsed.ok) return reply(400, { error: parsed.error });
    const req = parsed.value;

    // 1. Payment
    let paymentStatus;
    let amountPaid = 0;
    if (env.PAYSTACK_SECRET_KEY) {
        let payment;
        try {
            payment = await deps.verifyPayment(req.reference);
        } catch (err) {
            return reply(502, { error: 'Could not reach the payment provider. Please contact us with your reference ' + req.reference + '.' });
        }
        if (!payment.ok) return reply(402, { error: payment.error || 'Payment was not completed.' });
        const currency = env.PAYSTACK_CURRENCY || 'GHS';
        if (payment.currency !== currency) return reply(402, { error: `Payment currency must be ${currency}.` });
        if (payment.email && user.email && payment.email !== String(user.email).toLowerCase()) {
            return reply(403, { error: 'This payment belongs to a different account.' });
        }
        paymentStatus = 'paid';
        amountPaid = payment.amount;
    } else if (String(env.ALLOW_DEMO_PAYMENTS).toLowerCase() === 'true') {
        paymentStatus = 'demo';
    } else {
        return reply(503, { error: 'Online payments are not configured yet. Please contact the studio.' });
    }

    // 2. Booking (the database re-checks price, hours and availability)
    try {
        const booking = await deps.createBooking({
            p_user_id: user.id,
            p_studio_id: req.studioId,
            p_session_type: req.sessionType,
            p_date: req.date,
            p_start_hour: req.startHour,
            p_hours: req.hours,
            p_engineer: req.engineer,
            p_user_name: req.userName,
            p_phone: req.phone,
            p_notes: req.notes,
            p_ref: req.reference,
            p_payment_ref: req.reference,
            p_payment_status: paymentStatus,
            p_amount_paid: amountPaid
        });
        return reply(200, { booking });
    } catch (err) {
        const message = String(err && err.message || err);
        const code = err && err.code;
        const duplicate = code === '23505' || /duplicate key/.test(message);

        if (paymentStatus === 'paid' && !duplicate) {
            // Money was taken but no booking was made — record it for a refund
            try {
                await deps.logIssue({
                    user_id: user.id,
                    payment_ref: req.reference,
                    amount: amountPaid,
                    reason: message.slice(0, 300),
                    payload: req
                });
            } catch (logErr) {
                console.error('Failed to record payment issue', logErr);
            }
            return reply(409, {
                error: `${friendly(message, code)} Your payment (ref ${req.reference}) was received — we'll contact you to rebook or refund.`
            });
        }
        if (duplicate) return reply(409, { error: 'This payment reference has already been used.' });
        return reply(409, { error: friendly(message, code) });
    }
}

function friendly(message, code) {
    if (code === '23P01' || /bookings_no_overlap|no longer available/.test(message)) {
        return 'Sorry, that time slot was just taken.';
    }
    if (code === '23514' || /check constraint/.test(message)) {
        return 'Some booking details are invalid.';
    }
    // Messages raised deliberately by our SQL functions are user-facing
    return message.replace(/^.*?ERROR:\s*/, '');
}
