// Database tests: run the real Supabase migration in PGlite and check
// row-level security, pricing, availability and double-booking rules.
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './support/pg.mjs';

// Studio time is Africa/Accra (UTC+0)
function isoDate(daysAhead) {
    const d = new Date(Date.now() + daysAhead * 86400000);
    return d.toISOString().slice(0, 10);
}
const FUTURE = isoDate(10);

let db, kofi, ama, admin;

async function freshDb() {
    db = await createDatabase();
    kofi = await db.createUser({ email: 'Kofi@Example.com', name: 'Kofi Mensah' });
    ama = await db.createUser({ email: 'ama@example.com', name: 'Ama Owusu' });
    admin = await db.createUser({ email: 'owner@example.com', name: 'Owner' });
    await db.makeAdmin(admin);
}

const BOOKING_DEFAULTS = {
    studio: 'studio-a', session: 'Recording Session', date: FUTURE, start: 10, hours: 1,
    engineer: false, name: '', phone: '+233 50 123 4567', notes: '', status: 'paid', amount: 10000
};
let refCounter = 0;

function book(userId, overrides = {}) {
    const b = { ...BOOKING_DEFAULTS, ...overrides };
    const ref = overrides.ref || `ISR-TEST-${++refCounter}`;
    return db.service(tx => tx.query(
        `select * from public.create_booking($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [userId, b.studio, b.session, b.date, b.start, b.hours, b.engineer, b.name, b.phone, b.notes, ref, ref, b.status, b.amount]
    )).then(r => r.rows[0]);
}

async function rejects(promise, pattern) {
    await assert.rejects(promise, (err) => {
        assert.match(err.message, pattern);
        return true;
    });
}

describe('profiles & auth', () => {
    before(freshDb);

    test('sign-up creates a profile with lower-cased email and name', async () => {
        const { rows } = await db.user(kofi, tx => tx.query('select name, email, is_admin from public.profiles'));
        assert.deepEqual(rows, [{ name: 'Kofi Mensah', email: 'kofi@example.com', is_admin: false }]);
    });

    test('users only see their own profile; admins see everyone', async () => {
        const mine = await db.user(ama, tx => tx.query('select id from public.profiles'));
        assert.equal(mine.rows.length, 1);
        const all = await db.user(admin, tx => tx.query('select id from public.profiles'));
        assert.equal(all.rows.length, 3);
        const anon = await db.anon(tx => tx.query('select id from public.profiles'));
        assert.equal(anon.rows.length, 0);
    });

    test('users cannot make themselves admin', async () => {
        await rejects(db.user(kofi, tx => tx.query('update public.profiles set is_admin = true where id = $1', [kofi])), /permission denied/);
    });

    test('users can rename themselves', async () => {
        await db.user(kofi, tx => tx.query(`update public.profiles set name = 'Kofi M.' where id = $1`, [kofi]));
        const { rows } = await db.user(kofi, tx => tx.query('select name from public.profiles'));
        assert.equal(rows[0].name, 'Kofi M.');
    });

    test('is_admin() reflects the caller', async () => {
        assert.equal((await db.user(admin, tx => tx.query('select public.is_admin() a'))).rows[0].a, true);
        assert.equal((await db.user(kofi, tx => tx.query('select public.is_admin() a'))).rows[0].a, false);
        assert.equal((await db.anon(tx => tx.query('select public.is_admin() a'))).rows[0].a, false);
    });
});

describe('catalogue', () => {
    before(freshDb);

    test('anyone can read studios, instruments and testimonials', async () => {
        const counts = await db.anon(async tx => [
            (await tx.query('select count(*)::int n from public.studios')).rows[0].n,
            (await tx.query('select count(*)::int n from public.instruments')).rows[0].n,
            (await tx.query('select count(*)::int n from public.testimonials')).rows[0].n
        ]);
        assert.deepEqual(counts, [5, 6, 4]);
    });

    test('clients cannot change the catalogue', async () => {
        await rejects(db.user(kofi, tx => tx.query(`insert into public.studios (name, hourly_rate) values ('Hack', 1)`)), /row-level security/);
        const upd = await db.user(kofi, tx => tx.query(`update public.studios set hourly_rate = 1 returning id`));
        assert.equal(upd.rows.length, 0, 'update should affect no rows');
        const del = await db.anon(tx => tx.query(`delete from public.instruments returning id`));
        assert.equal(del.rows.length, 0);
    });

    test('admins can add, edit and delete studios and instruments', async () => {
        const s = await db.user(admin, tx => tx.query(`insert into public.studios (name, hourly_rate, location) values ('Booth X', 150, 'Annex') returning id`));
        assert.match(s.rows[0].id, /^studio-/);
        await db.user(admin, tx => tx.query(`update public.studios set hourly_rate = 175 where id = $1`, [s.rows[0].id]));
        const i = await db.user(admin, tx => tx.query(`insert into public.instruments (name, description) values ('Kalimba', 'Thumb piano') returning id`));
        assert.ok(Number(i.rows[0].id) > 6, 'identity continues after seeded ids');
        await db.user(admin, tx => tx.query(`delete from public.instruments where id = $1`, [i.rows[0].id]));
        await db.user(admin, tx => tx.query(`delete from public.studios where id = $1`, [s.rows[0].id]));
    });

    test('studio rate must be positive', async () => {
        await rejects(db.user(admin, tx => tx.query(`update public.studios set hourly_rate = 0 where id = 'studio-a'`)), /check constraint/);
    });
});

describe('pricing & availability', () => {
    beforeEach(freshDb);

    const quote = (args) => db.anon(tx => tx.query(
        `select public.quote_booking($1, $2::date, $3, $4, $5) q`,
        [args.studio ?? 'studio-c', args.date ?? FUTURE, args.start ?? 10, args.hours ?? 1, args.engineer ?? false]
    )).then(r => r.rows[0].q);

    test('quotes use the studio rate plus the engineer add-on', async () => {
        assert.deepEqual(await quote({ hours: 3, engineer: true }), { ok: true, amount: 1200, currency: 'GHS', studio_name: 'Raw Tracks Studio' });
        assert.equal((await quote({ studio: 'studio-d' })).amount, 180);
    });

    test('quotes reject bad input', async () => {
        assert.match((await quote({ studio: 'nope' })).error, /Studio not found/);
        assert.match((await quote({ hours: 5 })).error, /1–4 hours/);
        assert.match((await quote({ start: 9 })).error, /between 10:00 and 21:00/);
        assert.match((await quote({ start: 19, hours: 3 })).error, /between 10:00 and 21:00/);
        assert.match((await quote({ date: isoDate(-1) })).error, /already passed/);
        assert.match((await quote({ date: isoDate(120) })).error, /90 days/);
    });

    test('booked and blocked hours are reported without personal data', async () => {
        await book(kofi, { start: 11, hours: 2 });
        await db.superuser(d => d.query(`update public.studios set unavailable_slots = $1 where id = 'studio-a'`, [JSON.stringify({ [FUTURE]: ['15:00'] })]));
        const { rows } = await db.anon(tx => tx.query(`select public.get_booked_hours('studio-a', $1::date) h`, [FUTURE]));
        assert.deepEqual(rows[0].h, [11, 12, 15]);
        assert.match((await quote({ studio: 'studio-a', start: 15 })).error, /no longer available/);
        assert.match((await quote({ studio: 'studio-a', start: 10, hours: 2 })).error, /no longer available/);
        assert.equal((await quote({ studio: 'studio-a', start: 13, hours: 2 })).ok, true);
    });
});

describe('bookings', () => {
    beforeEach(freshDb);

    test('create_booking stores the server-computed price and profile email', async () => {
        const b = await book(kofi, { studio: 'studio-a', hours: 2, engineer: true, amount: 700 });
        assert.equal(Number(b.amount), 700);
        assert.equal(b.user_email, 'kofi@example.com');
        assert.equal(b.user_name, 'Kofi Mensah');
        assert.equal(b.studio_name, 'The Warmth Room');
        assert.equal(b.status, 'Pending');
    });

    test('clients cannot call create_booking or insert bookings directly', async () => {
        await rejects(db.user(kofi, tx => tx.query(
            `select public.create_booking($1,'studio-a','Recording Session',$2::date,10,1,false,'','0501234567','','x','x','paid',0)`, [kofi, FUTURE]
        )), /permission denied/);
        await rejects(db.user(kofi, tx => tx.query(
            `insert into public.bookings (ref, user_id, user_name, user_email, phone, studio_id, studio_name, session_type, date, start_hour, hours, amount, payment_status)
             values ('x', $1, 'K', 'k@x.com', '0501234567', 'studio-a', 'A', 'Recording Session', $2, 10, 1, 0, 'paid')`, [kofi, FUTURE]
        )), /row-level security/);
    });

    test('underpaying is rejected', async () => {
        await rejects(book(kofi, { amount: 100 }), /does not match/);
    });

    test('double-booking is impossible, including partial overlaps', async () => {
        await book(kofi, { start: 11, hours: 3 }); // 11–14
        await rejects(book(ama, { start: 11 }), /no longer available/);
        await rejects(book(ama, { start: 13, hours: 2 }), /no longer available/);
        await book(ama, { start: 14 }); // adjacent is fine
        await book(ama, { studio: 'studio-b', start: 11 }); // other studio is fine
    });

    test('the exclusion constraint holds even if the pre-check is bypassed', async () => {
        await book(kofi, { start: 12, hours: 2 });
        await rejects(db.superuser(d => d.query(
            `insert into public.bookings (ref, user_id, user_name, user_email, phone, studio_id, studio_name, session_type, date, start_hour, hours, amount, payment_status)
             values ('raw', $1, 'A', 'a@x.com', '0501234567', 'studio-a', 'A', 'Recording Session', $2, 13, 1, 0, 'paid')`, [ama, FUTURE]
        )), /bookings_no_overlap/);
    });

    test('payment references cannot be reused', async () => {
        await book(kofi, { ref: 'ISR-SAME' });
        await rejects(book(ama, { ref: 'ISR-SAME', start: 15 }), /duplicate key/);
    });

    test('invalid phone numbers and session types are rejected', async () => {
        await rejects(book(kofi, { phone: '12' }), /check constraint/);
        await rejects(book(kofi, { session: 'Hack' }), /check constraint/);
    });

    test('clients see only their own bookings; admins see all', async () => {
        await book(kofi);
        await book(ama, { start: 15 });
        assert.equal((await db.user(kofi, tx => tx.query('select id from public.bookings'))).rows.length, 1);
        assert.equal((await db.user(admin, tx => tx.query('select id from public.bookings'))).rows.length, 2);
        assert.equal((await db.anon(tx => tx.query('select id from public.bookings'))).rows.length, 0);
    });

    test('clients cannot change booking status directly', async () => {
        const b = await book(kofi);
        const r = await db.user(kofi, tx => tx.query(`update public.bookings set status = 'Approved' where id = $1 returning id`, [b.id]));
        assert.equal(r.rows.length, 0);
    });

    test('owners can cancel active upcoming bookings, which frees the slot', async () => {
        const b = await book(kofi);
        await rejects(db.user(ama, tx => tx.query('select public.cancel_booking($1)', [b.id])), /can no longer be cancelled/);
        await db.user(kofi, tx => tx.query('select public.cancel_booking($1)', [b.id]));
        await rejects(db.user(kofi, tx => tx.query('select public.cancel_booking($1)', [b.id])), /can no longer be cancelled/);
        await book(ama); // same slot now free
    });

    test('completed bookings cannot be cancelled by the client', async () => {
        const b = await book(kofi);
        await db.user(admin, tx => tx.query(`update public.bookings set status = 'Completed' where id = $1`, [b.id]));
        await rejects(db.user(kofi, tx => tx.query('select public.cancel_booking($1)', [b.id])), /can no longer be cancelled/);
    });

    test('admins can approve, reject and delete; restoring into a taken slot fails', async () => {
        const b = await book(kofi);
        await db.user(admin, tx => tx.query(`update public.bookings set status = 'Rejected' where id = $1`, [b.id]));
        await book(ama); // slot released
        await rejects(db.user(admin, tx => tx.query(`update public.bookings set status = 'Pending' where id = $1`, [b.id])), /bookings_no_overlap/);
        const del = await db.user(admin, tx => tx.query(`delete from public.bookings where id = $1 returning id`, [b.id]));
        assert.equal(del.rows.length, 1);
    });

    test('unknown statuses are rejected', async () => {
        const b = await book(kofi);
        await rejects(db.user(admin, tx => tx.query(`update public.bookings set status = 'Hacked' where id = $1`, [b.id])), /check constraint/);
    });
});

describe('reviews', () => {
    beforeEach(freshDb);

    const addReview = (userId, fields) => db.user(userId, tx => tx.query(
        `insert into public.feedbacks (studio_id, rating, message, name, user_email, featured) values ($1, $2, $3, $4, $5, $6) returning *`,
        [fields.studio ?? 'studio-b', fields.rating ?? 5, fields.message ?? 'Brilliant sound', fields.name ?? '', fields.email ?? 'spoof@evil.com', fields.featured ?? true]
    )).then(r => r.rows[0]);

    test('server fills trusted fields and ignores spoofed ones', async () => {
        const f = await addReview(kofi, {});
        assert.equal(f.user_email, 'kofi@example.com');
        assert.equal(f.studio_name, 'Pure Signal Studio');
        assert.equal(f.name, 'Kofi Mensah');
        assert.equal(f.featured, false, 'clients cannot self-feature');
    });

    test('validates rating, message and studio', async () => {
        await rejects(addReview(kofi, { rating: 6 }), /check constraint/);
        await rejects(addReview(kofi, { message: 'ok' }), /check constraint/);
        await rejects(addReview(kofi, { studio: 'nope' }), /choose a studio/);
    });

    test('anonymous users cannot post reviews', async () => {
        // Even claiming to be another user doesn't work without being signed in as them
        await rejects(db.anon(tx => tx.query(
            `insert into public.feedbacks (user_id, studio_id, rating, message) values ($1, 'studio-a', 5, 'Hello there')`, [kofi]
        )), /row-level security/);
        await rejects(db.user(ama, tx => tx.query(
            `insert into public.feedbacks (user_id, studio_id, rating, message) values ($1, 'studio-a', 5, 'Hello there')`, [kofi]
        )), /row-level security/);
    });

    test('reviews are private until an admin features them', async () => {
        const f = await addReview(kofi, {});
        assert.equal((await db.user(ama, tx => tx.query('select id from public.feedbacks'))).rows.length, 0);
        assert.equal((await db.anon(tx => tx.query('select * from public.get_featured_reviews()'))).rows.length, 0);
        await db.user(admin, tx => tx.query('update public.feedbacks set featured = true where id = $1', [f.id]));
        const { rows } = await db.anon(tx => tx.query('select * from public.get_featured_reviews()'));
        assert.deepEqual(rows, [{ name: 'Kofi Mensah', stars: 5, text: 'Brilliant sound' }]);
    });

    test('clients cannot edit or delete reviews after posting', async () => {
        const f = await addReview(kofi, {});
        const upd = await db.user(kofi, tx => tx.query(`update public.feedbacks set featured = true where id = $1 returning id`, [f.id]));
        assert.equal(upd.rows.length, 0);
        const del = await db.user(kofi, tx => tx.query(`delete from public.feedbacks where id = $1 returning id`, [f.id]));
        assert.equal(del.rows.length, 0);
    });
});

describe('payment issues', () => {
    before(freshDb);

    test('only admins can read payment issues', async () => {
        await db.service(tx => tx.query(`insert into public.payment_issues (user_id, payment_ref, amount, reason) values ($1, 'ref', 250, 'slot taken')`, [kofi]));
        assert.equal((await db.user(kofi, tx => tx.query('select id from public.payment_issues'))).rows.length, 0);
        assert.equal((await db.user(admin, tx => tx.query('select id from public.payment_issues'))).rows.length, 1);
    });
});
