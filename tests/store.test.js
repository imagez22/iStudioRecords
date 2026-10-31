const Store = require('../store');

// Fixed clock: Mon 5 Oct 2026, 09:30 local time
const NOW = new Date(2026, 9, 5, 9, 30);
const TODAY = '2026-10-05';
const FUTURE = '2026-10-15';

// ---- Minimal fake of the supabase-js query builder ----
function fakeClient(tables, rpcs = {}, extra = {}) {
    const log = [];
    function builder(table) {
        const ops = [];
        const b = {
            select() { ops.push('select'); return b; },
            order() { return b; },
            eq(col, val) { ops.push(`eq:${col}=${val}`); return b; },
            insert(row) { ops.push(['insert', row]); return b; },
            update(row) { ops.push(['update', row]); return b; },
            delete() { ops.push('delete'); return b; },
            single() { return b; },
            maybeSingle() { return b; },
            then(resolve, reject) {
                log.push({ table, ops });
                const handler = tables[table];
                const result = typeof handler === 'function' ? handler(ops) : { data: handler, error: null };
                return Promise.resolve(result).then(resolve, reject);
            }
        };
        return b;
    }
    return {
        log,
        from: builder,
        rpc: (name, args) => {
            log.push({ rpc: name, args });
            const r = rpcs[name];
            const result = typeof r === 'function' ? r(args)
                : (r && typeof r === 'object' && 'data' in r ? r : { data: r, error: null });
            return Promise.resolve(result);
        },
        ...extra
    };
}

const studioRows = [
    { id: 'studio-a', name: 'The Warmth Room', description: 'Analog', long_description: 'Warm', location: 'First Floor', image_url: 'images/studio-a.jpg', hourly_rate: '250.00', unavailable_slots: {} },
    { id: 'studio-c', name: 'Raw Tracks Studio', description: 'Live', long_description: '', location: 'Second Floor', image_url: '', hourly_rate: 300, unavailable_slots: {} }
];
const bookingRow = {
    id: 'b-1', ref: 'ISR-1', user_id: 'u1', user_email: 'Kofi@Example.com', user_name: 'Kofi', phone: '0501234567',
    studio_id: 'studio-a', studio_name: 'The Warmth Room', session_type: 'Recording Session', date: FUTURE,
    start_hour: 14, hours: 2, engineer: true, amount: '700.00', currency: 'GHS', status: 'Pending',
    payment_status: 'paid', payment_ref: 'ISR-1', notes: '', created_at: '2026-10-04T10:00:00Z'
};

function catalogue(overrides = {}) {
    return {
        studios: studioRows,
        instruments: [{ id: 1, name: 'Violin', image_url: 'v.jpg', description: 'Strings', long_description: '', fun_fact: 'Old', joke: '' }],
        testimonials: [{ name: 'Adi', stars: 5, text: 'Great', avatar_url: 'a.jpg' }],
        bookings: [bookingRow],
        feedbacks: [],
        profiles: [{ id: 'u1', name: 'Kofi', email: 'kofi@example.com', is_admin: false, created_at: '2026-10-01' }],
        payment_issues: [],
        ...overrides
    };
}

async function loadAs(user, tables = catalogue()) {
    const client = fakeClient(tables, { get_featured_reviews: [{ name: 'Ama', stars: 4, text: 'Lovely room' }] });
    Store.setClient(client);
    await Store.init(user);
    return client;
}

describe('loading', () => {
    test('guests load only the public catalogue', async () => {
        const c = await loadAs({ loggedIn: false });
        const tables = c.log.filter(l => l.table).map(l => l.table).sort();
        expect(tables).toEqual(['instruments', 'studios', 'testimonials']);
        expect(Store.getStudios()).toHaveLength(2);
        expect(Store.getStudio('studio-a').hourlyRate).toBe(250);
        expect(Store.getTestimonials().map(t => t.name)).toEqual(['Adi', 'Ama']);
        expect(Store.getBookings()).toEqual([]);
        expect(Store.isReady()).toBe(true);
    });

    test('clients also load their bookings and reviews, but not admin data', async () => {
        const c = await loadAs({ loggedIn: true, isAdmin: false });
        const tables = c.log.filter(l => l.table).map(l => l.table);
        expect(tables).toContain('bookings');
        expect(tables).toContain('feedbacks');
        expect(tables).not.toContain('profiles');
        expect(tables).not.toContain('payment_issues');
    });

    test('admins load profiles and payment issues too', async () => {
        const c = await loadAs({ loggedIn: true, isAdmin: true });
        const tables = c.log.filter(l => l.table).map(l => l.table);
        expect(tables).toEqual(expect.arrayContaining(['profiles', 'payment_issues']));
        expect(Store.getProfiles()[0]).toMatchObject({ email: 'kofi@example.com', isAdmin: false });
    });

    test('load errors are surfaced', async () => {
        const client = fakeClient({ ...catalogue(), studios: () => ({ data: null, error: new Error('boom') }) }, { get_featured_reviews: [] });
        Store.setClient(client);
        await expect(Store.init({ loggedIn: false })).rejects.toThrow('boom');
    });
});

describe('mapping', () => {
    test('maps a booking row to the app shape', () => {
        expect(Store.mapBooking(bookingRow)).toMatchObject({
            id: 'b-1', userEmail: 'kofi@example.com', date: FUTURE, time: '14:00', hours: 2,
            slots: ['14:00', '15:00'], amount: 700, engineer: true, createdAt: '2026-10-04'
        });
    });

    test('maps studios both ways', () => {
        const s = Store.mapStudio(studioRows[0]);
        expect(s).toMatchObject({ imageUrl: 'images/studio-a.jpg', longDescription: 'Warm', hourlyRate: 250 });
        expect(Store.studioToRow({ ...s, name: '  Spaced  ' })).toMatchObject({ id: 'studio-a', name: 'Spaced', hourly_rate: 250, image_url: 'images/studio-a.jpg' });
        expect(Store.studioToRow({ name: 'New', hourlyRate: '150' })).not.toHaveProperty('id');
    });

    test('maps instruments to rows', () => {
        expect(Store.instrumentToRow({ id: '7', name: 'Kalimba', funFact: 'x' })).toMatchObject({ id: 7, name: 'Kalimba', fun_fact: 'x' });
    });
});

describe('availability (pure)', () => {
    const taken = new Set(['14:00', '15:00']);

    test('offers hourly start slots 10:00–20:00', () => {
        const slots = Store.computeAvailability(new Set(), FUTURE, 1, NOW);
        expect(slots.map(s => s.slot)).toHaveLength(11);
        expect(slots.every(s => s.available)).toBe(true);
    });

    test('blocks taken hours and overlaps', () => {
        const a = Store.computeAvailability(taken, FUTURE, 2, NOW);
        const by = Object.fromEntries(a.map(x => [x.slot, x]));
        expect(by['14:00']).toMatchObject({ available: false, reason: 'Already booked' });
        expect(by['13:00']).toMatchObject({ available: false, reason: 'Overlaps another booking' });
        expect(by['12:00'].available).toBe(true);
        expect(by['16:00'].available).toBe(true);
    });

    test('sessions must finish by closing time', () => {
        const a = Store.computeAvailability(new Set(), FUTURE, 4, NOW);
        expect(a.find(x => x.slot === '17:00').available).toBe(true);
        expect(a.find(x => x.slot === '18:00').reason).toBe('Runs past closing time');
    });

    test('past dates, earlier hours today and dates too far ahead are unavailable', () => {
        expect(Store.computeAvailability(new Set(), '2026-10-04', 1, NOW).every(x => !x.available)).toBe(true);
        const today = Store.computeAvailability(new Set(), TODAY, 1, NOW);
        expect(today.find(x => x.slot === '10:00').available).toBe(true);
        expect(Store.computeAvailability(new Set(), TODAY, 1, new Date(2026, 9, 5, 10, 5)).find(x => x.slot === '10:00').available).toBe(false);
        expect(Store.computeAvailability(new Set(), '2027-03-01', 1, NOW)[0].reason).toMatch(/90 days/);
    });

    test('fetchTakenSlots converts server hours to slots', async () => {
        Store.setClient(fakeClient({}, { get_booked_hours: { data: [11, 12], error: null } }));
        const set = await Store.fetchTakenSlots('studio-a', FUTURE);
        expect([...set]).toEqual(['11:00', '12:00']);
    });
});

describe('pricing & quotes', () => {
    beforeAll(() => loadAs({ loggedIn: false }));

    test('display price uses the studio rate and engineer add-on', () => {
        expect(Store.calculatePrice('studio-c', 3, true)).toMatchObject({ studioCost: 900, engineerCost: 300, total: 1200 });
        expect(Store.calculatePrice('studio-a', 9).hours).toBe(4);
    });

    test('quote() returns the server price or its error', async () => {
        Store.setClient(fakeClient({}, { quote_booking: { data: { ok: true, amount: 700, currency: 'GHS' }, error: null } }));
        expect(await Store.quote({ studioId: 'studio-a', date: FUTURE, time: '14:00', hours: 2, engineer: true }))
            .toEqual({ ok: true, amount: 700, currency: 'GHS' });
        Store.setClient(fakeClient({}, { quote_booking: { data: { ok: false, error: 'That time has already passed.' }, error: null } }));
        expect((await Store.quote({ studioId: 'studio-a', date: FUTURE, time: '10:00', hours: 1 })).error).toBe('That time has already passed.');
    });

    test('formats Ghana cedis', () => {
        expect(Store.formatMoney(1500)).toBe('GH₵1,500');
    });
});

describe('booking through the Edge Function', () => {
    const input = { studioId: 'studio-a', sessionType: 'Recording Session', date: FUTURE, time: '14:00', hours: 2, engineer: true, userName: 'Kofi', phone: '0501234567', notes: '', reference: 'ISR-1' };

    test('sends the expected body and caches the new booking', async () => {
        let sent;
        const client = fakeClient({}, {}, {
            functions: { invoke: async (name, opts) => { sent = { name, ...opts }; return { data: { booking: bookingRow }, error: null }; } }
        });
        Store.setClient(client);
        const res = await Store.book(input);
        expect(sent.name).toBe('book');
        expect(sent.body).toMatchObject({ studioId: 'studio-a', startHour: 14, hours: 2, engineer: true, reference: 'ISR-1' });
        expect(res.ok).toBe(true);
        expect(Store.getBooking('b-1')).not.toBeNull();
    });

    test('surfaces the server error message', async () => {
        const error = { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'Sorry, that time slot was just taken.' }) } };
        Store.setClient(fakeClient({}, {}, { functions: { invoke: async () => ({ data: null, error }) } }));
        expect(await Store.book(input)).toEqual({ ok: false, error: 'Sorry, that time slot was just taken.' });
    });
});

describe('booking helpers', () => {
    const b = Store.mapBooking(bookingRow);

    test('only the owner can cancel active upcoming bookings (UI hint)', () => {
        expect(Store.canCancel(b, 'KOFI@example.com', NOW)).toBe(true);
        expect(Store.canCancel(b, 'ama@example.com', NOW)).toBe(false);
        expect(Store.canCancel({ ...b, status: 'Completed' }, 'kofi@example.com', NOW)).toBe(false);
        expect(Store.canCancel(b, 'kofi@example.com', new Date(2026, 9, 20))).toBe(false);
    });

    test('upcoming excludes past, cancelled and completed', () => {
        expect(Store.isUpcoming(b, NOW)).toBe(true);
        expect(Store.isUpcoming({ ...b, status: 'Cancelled' }, NOW)).toBe(false);
        expect(Store.isUpcoming({ ...b, status: 'Completed' }, NOW)).toBe(false);
        expect(Store.isUpcoming(b, new Date(2026, 9, 20))).toBe(false);
    });

    test('revenue counts only paid, active bookings', () => {
        const list = [b, { ...b, amount: 200, paymentStatus: 'demo' }, { ...b, amount: 300, status: 'Rejected' }];
        expect(Store.revenue(list)).toBe(700);
    });

    test('friendly errors for database failures', () => {
        expect(Store.friendlyError({ code: '23P01', message: 'x' })).toMatch(/already taken/);
        expect(Store.friendlyError({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/permission/);
        expect(Store.friendlyError({ message: 'Please choose a studio.' })).toBe('Please choose a studio.');
    });
});

describe('utilities', () => {
    test('escapeHTML neutralises markup', () => {
        expect(Store.escapeHTML('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
        expect(Store.escapeHTML(null)).toBe('');
    });

    test('localDateISO uses the local calendar date', () => {
        expect(Store.localDateISO(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02');
    });

    test('CSV export quotes values and blocks formula injection', () => {
        const b = { ...Store.mapBooking(bookingRow), notes: 'Bring "mics", please', userName: '=HYPERLINK("x")' };
        const [header, row] = Store.bookingsToCSV([b]).split('\n');
        expect(header.split(',')[0]).toBe('ref');
        expect(row).toContain('"Bring ""mics"", please"');
        expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    });

    test('ICS export spans the booked hours', () => {
        const ics = Store.bookingToICS(Store.mapBooking(bookingRow));
        expect(ics).toContain('DTSTART:20261015T140000');
        expect(ics).toContain('DTEND:20261015T160000');
    });
});
