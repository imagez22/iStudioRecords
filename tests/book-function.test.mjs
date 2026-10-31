// Tests for the `book` Edge Function logic (payment verification + booking).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { handleBook, verifyPaystack, parseBookingRequest } from '../supabase/functions/_shared/booking.mjs';
import { createDatabase } from './support/pg.mjs';

const FUTURE = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'kofi@example.com' };

function request(overrides = {}) {
    return {
        studioId: 'studio-a', sessionType: 'Recording Session', date: FUTURE,
        startHour: 14, hours: 2, engineer: true, userName: 'Kofi', phone: '+233 50 123 4567',
        notes: 'Two vocal mics', reference: 'ISR-ABC123-XYZ', ...overrides
    };
}

function fakeDeps(overrides = {}) {
    const calls = { created: [], issues: [] };
    const deps = {
        user: USER,
        env: { PAYSTACK_SECRET_KEY: 'sk_test_x' },
        verifyPayment: async () => ({ ok: true, amount: 700, currency: 'GHS', email: 'kofi@example.com' }),
        createBooking: async (p) => { calls.created.push(p); return { id: 'b1', ref: p.p_ref }; },
        logIssue: async (i) => { calls.issues.push(i); },
        ...overrides
    };
    return { deps, calls };
}

describe('request validation', () => {
    test('accepts a valid request', () => {
        assert.equal(parseBookingRequest(request()).ok, true);
    });
    test('rejects bad fields', () => {
        assert.match(parseBookingRequest(request({ sessionType: 'x' })).error, /session type/);
        assert.match(parseBookingRequest(request({ date: 'tomorrow' })).error, /date/);
        assert.match(parseBookingRequest(request({ startHour: 'ten' })).error, /time/);
        assert.match(parseBookingRequest(request({ phone: '12' })).error, /phone/);
        assert.match(parseBookingRequest(request({ reference: 'a b' })).error, /reference/);
        assert.match(parseBookingRequest(null).error, /Invalid/);
    });
});

describe('handleBook (unit)', () => {
    test('requires sign-in', async () => {
        const { deps } = fakeDeps({ user: null });
        assert.equal((await handleBook(request(), deps)).status, 401);
    });

    test('creates a paid booking after successful verification', async () => {
        const { deps, calls } = fakeDeps();
        const res = await handleBook(request(), deps);
        assert.equal(res.status, 200);
        assert.equal(calls.created[0].p_payment_status, 'paid');
        assert.equal(calls.created[0].p_amount_paid, 700);
        assert.equal(calls.created[0].p_user_id, USER.id);
    });

    test('rejects failed payments, wrong currency and another account\'s payment', async () => {
        let { deps } = fakeDeps({ verifyPayment: async () => ({ ok: false, error: 'Payment abandoned.' }) });
        assert.deepEqual(await handleBook(request(), deps), { status: 402, body: { error: 'Payment abandoned.' } });
        ({ deps } = fakeDeps({ verifyPayment: async () => ({ ok: true, amount: 700, currency: 'NGN', email: USER.email }) }));
        assert.equal((await handleBook(request(), deps)).status, 402);
        ({ deps } = fakeDeps({ verifyPayment: async () => ({ ok: true, amount: 700, currency: 'GHS', email: 'other@x.com' }) }));
        assert.equal((await handleBook(request(), deps)).status, 403);
    });

    test('refuses to book when payments are not configured', async () => {
        const { deps, calls } = fakeDeps({ env: {} });
        assert.equal((await handleBook(request(), deps)).status, 503);
        assert.equal(calls.created.length, 0);
    });

    test('demo mode books without payment when explicitly enabled', async () => {
        const { deps, calls } = fakeDeps({ env: { ALLOW_DEMO_PAYMENTS: 'true' } });
        assert.equal((await handleBook(request(), deps)).status, 200);
        assert.equal(calls.created[0].p_payment_status, 'demo');
    });

    test('a paid booking that loses the slot race is logged for refund', async () => {
        const err = Object.assign(new Error('conflicting key value violates exclusion constraint "bookings_no_overlap"'), { code: '23P01' });
        const { deps, calls } = fakeDeps({ createBooking: async () => { throw err; } });
        const res = await handleBook(request(), deps);
        assert.equal(res.status, 409);
        assert.match(res.body.error, /just taken.*ISR-ABC123-XYZ.*refund/);
        assert.equal(calls.issues.length, 1);
        assert.equal(calls.issues[0].amount, 700);
    });

    test('reused payment references are rejected without logging an issue', async () => {
        const err = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
        const { deps, calls } = fakeDeps({ createBooking: async () => { throw err; } });
        const res = await handleBook(request(), deps);
        assert.equal(res.status, 409);
        assert.match(res.body.error, /already been used/);
        assert.equal(calls.issues.length, 0);
    });

    test('payment provider outage returns 502', async () => {
        const { deps } = fakeDeps({ verifyPayment: async () => { throw new Error('ECONNRESET'); } });
        assert.equal((await handleBook(request(), deps)).status, 502);
    });
});

describe('verifyPaystack', () => {
    const fakeFetch = (status, json) => async (url, opts) => {
        fakeFetch.last = { url, opts };
        return { ok: status === 200, json: async () => json };
    };

    test('parses a successful transaction (pesewas → cedis)', async () => {
        const f = fakeFetch(200, { status: true, data: { status: 'success', amount: 70000, currency: 'GHS', reference: 'R1', customer: { email: 'Kofi@Example.com' } } });
        const r = await verifyPaystack('R1', 'sk_test_1', f);
        assert.deepEqual(r, { ok: true, error: null, amount: 700, currency: 'GHS', email: 'kofi@example.com', reference: 'R1' });
        assert.equal(fakeFetch.last.url, 'https://api.paystack.co/transaction/verify/R1');
        assert.equal(fakeFetch.last.opts.headers.Authorization, 'Bearer sk_test_1');
    });

    test('reports abandoned and unknown transactions', async () => {
        assert.equal((await verifyPaystack('R', 'k', fakeFetch(200, { status: true, data: { status: 'abandoned' } }))).ok, false);
        const r = await verifyPaystack('R', 'k', fakeFetch(400, { status: false, message: 'Transaction reference not found' }));
        assert.deepEqual([r.ok, r.error], [false, 'Transaction reference not found']);
    });
});

describe('handleBook + real database', () => {
    let db, userId;
    before(async () => {
        db = await createDatabase();
        userId = await db.createUser({ email: 'kofi@example.com', name: 'Kofi Mensah' });
    });

    function liveDeps(amount) {
        return {
            user: { id: userId, email: 'kofi@example.com' },
            env: { PAYSTACK_SECRET_KEY: 'sk_test_x' },
            verifyPayment: async () => ({ ok: true, amount, currency: 'GHS', email: 'kofi@example.com' }),
            createBooking: (p) => db.service(tx => tx.query(
                `select * from public.create_booking($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                [p.p_user_id, p.p_studio_id, p.p_session_type, p.p_date, p.p_start_hour, p.p_hours, p.p_engineer,
                 p.p_user_name, p.p_phone, p.p_notes, p.p_ref, p.p_payment_ref, p.p_payment_status, p.p_amount_paid]
            )).then(r => r.rows[0]),
            logIssue: (i) => db.service(tx => tx.query(
                `insert into public.payment_issues (user_id, payment_ref, amount, reason, payload) values ($1,$2,$3,$4,$5)`,
                [i.user_id, i.payment_ref, i.amount, i.reason, JSON.stringify(i.payload)]
            ))
        };
    }

    test('books and stores the server price', async () => {
        const res = await handleBook(request({ reference: 'ISR-LIVE-1' }), liveDeps(700));
        assert.equal(res.status, 200);
        assert.equal(Number(res.body.booking.amount), 700);
        assert.equal(res.body.booking.payment_status, 'paid');
    });

    test('underpayment is refused and logged', async () => {
        const res = await handleBook(request({ reference: 'ISR-LIVE-2', startHour: 10 }), liveDeps(1));
        assert.equal(res.status, 409);
        assert.match(res.body.error, /does not match/);
    });

    test('second payment for a taken slot is logged as a payment issue', async () => {
        const res = await handleBook(request({ reference: 'ISR-LIVE-3' }), liveDeps(700));
        assert.equal(res.status, 409);
        assert.match(res.body.error, /just taken/);
        const { rows } = await db.superuser(d => d.query(`select payment_ref, amount from public.payment_issues order by id`));
        assert.deepEqual(rows.map(r => r.payment_ref), ['ISR-LIVE-2', 'ISR-LIVE-3']);
    });
});
