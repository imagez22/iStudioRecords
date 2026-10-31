/* =============================================================
   I Studio Records — Data Store (Supabase)
   Reads are served from an in-memory cache loaded by init();
   writes go to Supabase and then update the cache. Pricing and
   availability are enforced by the database — the values here
   are for display only.
   ============================================================= */
(function (root) {
    'use strict';

    const OPEN_HOUR = 10;          // first bookable start (10:00)
    const CLOSE_HOUR = 21;         // studio closes at 21:00
    const MAX_HOURS = 4;
    const ENGINEER_RATE = 100;     // GH₵ per hour
    const CURRENCY = 'GHS';
    const MAX_DAYS_AHEAD = 90;

    const SESSION_TYPES = [
        'Recording Session',
        'Mixing & Mastering',
        'Beat Production',
        'Podcast / Voice-Over',
        'Band Rehearsal'
    ];
    const INACTIVE_STATUSES = ['Rejected', 'Cancelled'];
    const STATUSES = ['Pending', 'Approved', 'Completed', 'Rejected', 'Cancelled'];

    let state = emptyState();
    let client = null;

    function emptyState() {
        return {
            studios: [], instruments: [], testimonials: [], featured: [],
            bookings: [], feedbacks: [], profiles: [], paymentIssues: [],
            loaded: false
        };
    }

    function sb() {
        if (client) return client;
        if (typeof root.getSupabase === 'function') client = root.getSupabase();
        return client;
    }

    /** Inject a client (tests). */
    function setClient(c) {
        client = c;
    }

    // ---------------- Generic utils ----------------
    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    // Local calendar date as YYYY-MM-DD (toISOString would give the UTC date)
    function localDateISO(date = new Date()) {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function hourToSlot(hour) {
        return `${pad(hour)}:00`;
    }

    function slotToHour(slot) {
        return parseInt(String(slot).split(':')[0], 10);
    }

    function formatMoney(amount) {
        const n = Number(amount) || 0;
        return 'GH₵' + n.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    function formatDate(iso) {
        if (!iso) return '—';
        const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
        if (!y || !m || !d) return iso;
        return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    function generateRef() {
        const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
        return `ISR-${Date.now().toString(36).toUpperCase()}-${rand}`;
    }

    /** Turn database errors into messages fit for users. */
    function friendlyError(error) {
        const msg = String((error && error.message) || error || '');
        const code = error && error.code;
        if (code === '23P01' || /bookings_no_overlap/.test(msg)) return 'That time slot is already taken.';
        if (code === '42501' || /row-level security|permission denied/.test(msg)) return 'You do not have permission to do that.';
        if (code === '23514' || /check constraint/.test(msg)) return 'Some details are invalid. Please check the form.';
        if (code === '23503') return 'That item is linked to other records.';
        if (/failed to fetch|network/i.test(msg)) return 'Network error — please check your connection.';
        return msg || 'Something went wrong. Please try again.';
    }

    // ---------------- Row mapping (database ⇄ app) ----------------
    function mapStudio(r) {
        return {
            id: r.id,
            name: r.name,
            description: r.description || '',
            longDescription: r.long_description || '',
            location: r.location || '',
            imageUrl: r.image_url || '',
            hourlyRate: Number(r.hourly_rate) || 0,
            unavailableSlots: r.unavailable_slots || {}
        };
    }

    function studioToRow(s) {
        const row = {
            name: String(s.name || '').trim(),
            description: String(s.description || '').trim(),
            long_description: String(s.longDescription || '').trim(),
            location: String(s.location || '').trim(),
            image_url: String(s.imageUrl || '').trim(),
            hourly_rate: Number(s.hourlyRate)
        };
        if (s.id) row.id = s.id;
        return row;
    }

    function mapInstrument(r) {
        return {
            id: r.id,
            name: r.name,
            imageUrl: r.image_url || '',
            description: r.description || '',
            longDescription: r.long_description || '',
            funFact: r.fun_fact || '',
            joke: r.joke || ''
        };
    }

    function instrumentToRow(i) {
        const row = {
            name: String(i.name || '').trim(),
            image_url: String(i.imageUrl || '').trim(),
            description: String(i.description || '').trim(),
            long_description: String(i.longDescription || '').trim(),
            fun_fact: String(i.funFact || '').trim(),
            joke: String(i.joke || '').trim()
        };
        if (i.id) row.id = Number(i.id);
        return row;
    }

    function mapBooking(r) {
        const start = Number(r.start_hour);
        const hours = Number(r.hours) || 1;
        return {
            id: r.id,
            ref: r.ref,
            userId: r.user_id,
            userEmail: String(r.user_email || '').toLowerCase(),
            userName: r.user_name || '',
            phone: r.phone || '',
            studioId: r.studio_id || '',
            studioName: r.studio_name || '',
            sessionType: r.session_type,
            date: String(r.date).slice(0, 10),
            time: hourToSlot(start),
            hours,
            slots: Array.from({ length: hours }, (_, i) => hourToSlot(start + i)),
            engineer: !!r.engineer,
            amount: Number(r.amount) || 0,
            currency: r.currency || CURRENCY,
            status: r.status,
            paymentRef: r.payment_ref || '',
            paymentStatus: r.payment_status,
            notes: r.notes || '',
            createdAt: String(r.created_at || '').slice(0, 10)
        };
    }

    function mapFeedback(r) {
        return {
            id: r.id,
            userEmail: String(r.user_email || '').toLowerCase(),
            name: r.name || '',
            studioId: r.studio_id || '',
            studioName: r.studio_name || '',
            rating: Number(r.rating),
            message: r.message,
            date: String(r.created_at || '').slice(0, 10),
            featured: !!r.featured
        };
    }

    function mapProfile(r) {
        return { id: r.id, name: r.name, email: r.email, isAdmin: !!r.is_admin, createdAt: r.created_at };
    }

    function mapIssue(r) {
        return {
            id: r.id, paymentRef: r.payment_ref, amount: Number(r.amount) || 0,
            reason: r.reason, resolved: !!r.resolved, createdAt: String(r.created_at || '').slice(0, 10)
        };
    }

    // ---------------- Loading ----------------
    async function query(builder) {
        const { data, error } = await builder;
        if (error) throw error;
        return data;
    }

    /**
     * Load everything the current user may see. Public catalogue for all;
     * own bookings/reviews for clients; everything for admins.
     */
    async function init(user) {
        const c = sb();
        if (!c) throw new Error('Supabase is not configured');
        const u = user || (typeof root.getCurrentUser === 'function' ? root.getCurrentUser() : { loggedIn: false });

        const [studios, instruments, testimonials, featured] = await Promise.all([
            query(c.from('studios').select('*').order('sort_order').order('created_at')),
            query(c.from('instruments').select('*').order('sort_order').order('id')),
            query(c.from('testimonials').select('*').order('sort_order')),
            query(c.rpc('get_featured_reviews'))
        ]);
        const next = emptyState();
        next.studios = studios.map(mapStudio);
        next.instruments = instruments.map(mapInstrument);
        next.testimonials = testimonials.map(t => ({ name: t.name, stars: t.stars, text: t.text, avatarUrl: t.avatar_url }));
        next.featured = (featured || []).map(f => ({ name: f.name, stars: f.stars, text: f.text, avatarUrl: '' }));

        if (u && u.loggedIn) {
            const [bookings, feedbacks] = await Promise.all([
                query(c.from('bookings').select('*').order('date', { ascending: false }).order('start_hour')),
                query(c.from('feedbacks').select('*').order('created_at', { ascending: false }))
            ]);
            next.bookings = bookings.map(mapBooking);
            next.feedbacks = feedbacks.map(mapFeedback);
            if (u.isAdmin) {
                const [profiles, issues] = await Promise.all([
                    query(c.from('profiles').select('*').order('created_at')),
                    query(c.from('payment_issues').select('*').order('created_at', { ascending: false }))
                ]);
                next.profiles = profiles.map(mapProfile);
                next.paymentIssues = issues.map(mapIssue);
            }
        }
        next.loaded = true;
        state = next;
        return state;
    }

    // ---------------- Getters ----------------
    const getStudios = () => state.studios;
    const getStudio = (id) => state.studios.find(s => s.id === String(id)) || null;
    const getInstruments = () => state.instruments;
    const getInstrument = (id) => state.instruments.find(i => String(i.id) === String(id)) || null;
    const getBookings = () => state.bookings;
    const getBooking = (id) => state.bookings.find(b => b.id === String(id)) || null;
    const getFeedbacks = () => state.feedbacks;
    const getProfiles = () => state.profiles;
    const getPaymentIssues = () => state.paymentIssues;
    const getTestimonials = () => [...state.testimonials, ...state.featured];
    const isReady = () => state.loaded;

    function getUserBookings(email) {
        const e = String(email || '').toLowerCase();
        return state.bookings.filter(b => b.userEmail === e);
    }

    function getUserFeedbacks(email) {
        const e = String(email || '').toLowerCase();
        return state.feedbacks.filter(f => f.userEmail === e);
    }

    // ---------------- Availability ----------------
    function allStartSlots() {
        const slots = [];
        for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) slots.push(hourToSlot(h));
        return slots;
    }

    /** Taken hours on a date for a studio, from the server (as "HH:00" strings). */
    async function fetchTakenSlots(studioId, date) {
        const { data, error } = await sb().rpc('get_booked_hours', { p_studio_id: studioId, p_date: date });
        if (error) throw error;
        return new Set((data || []).map(hourToSlot));
    }

    /** Pure: mark each start slot available or not. `now` is injectable for tests. */
    function computeAvailability(taken, date, hours = 1, now = new Date()) {
        const today = localDateISO(now);
        const max = new Date(now);
        max.setDate(max.getDate() + MAX_DAYS_AHEAD);
        const lastDay = localDateISO(max);
        return allStartSlots().map(slot => {
            const start = slotToHour(slot);
            let available = true;
            let reason = '';
            if (!date || date < today) {
                available = false; reason = 'Date has passed';
            } else if (date > lastDay) {
                available = false; reason = `Bookings open ${MAX_DAYS_AHEAD} days ahead`;
            } else if (date === today && start <= now.getHours()) {
                available = false; reason = 'Time has passed';
            } else if (start + hours > CLOSE_HOUR) {
                available = false; reason = 'Runs past closing time';
            } else {
                for (let h = start; h < start + hours; h++) {
                    if (taken.has(hourToSlot(h))) {
                        available = false;
                        reason = h === start ? 'Already booked' : 'Overlaps another booking';
                        break;
                    }
                }
            }
            return { slot, available, reason };
        });
    }

    async function getAvailability(studioId, date, hours = 1, now = new Date()) {
        return computeAvailability(await fetchTakenSlots(studioId, date), date, hours, now);
    }

    // ---------------- Pricing ----------------
    function calculatePrice(studioId, hours = 1, engineer = false) {
        const studio = getStudio(studioId);
        const rate = studio ? studio.hourlyRate : 0;
        const h = Math.max(1, Math.min(MAX_HOURS, parseInt(hours, 10) || 1));
        const studioCost = rate * h;
        const engineerCost = engineer ? ENGINEER_RATE * h : 0;
        return { rate, hours: h, studioCost, engineerCost, total: studioCost + engineerCost };
    }

    /** Server-side validation + authoritative price for a proposed session. */
    async function quote({ studioId, date, time, hours, engineer }) {
        const { data, error } = await sb().rpc('quote_booking', {
            p_studio_id: studioId,
            p_date: date,
            p_start_hour: slotToHour(time),
            p_hours: hours,
            p_engineer: !!engineer
        });
        if (error) return { ok: false, error: friendlyError(error) };
        return data && data.ok
            ? { ok: true, amount: Number(data.amount), currency: data.currency }
            : { ok: false, error: (data && data.error) || 'That session is not available.' };
    }

    // ---------------- Bookings ----------------
    /** Create a booking through the `book` Edge Function (verifies payment). */
    async function book(input) {
        const { data, error } = await sb().functions.invoke('book', {
            body: {
                studioId: input.studioId,
                sessionType: input.sessionType,
                date: input.date,
                startHour: slotToHour(input.time),
                hours: input.hours,
                engineer: !!input.engineer,
                userName: input.userName,
                phone: input.phone,
                notes: input.notes,
                reference: input.reference
            }
        });
        if (error) {
            let message = '';
            try {
                const body = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
                message = body && body.error;
            } catch (e) { /* not JSON */ }
            return { ok: false, error: message || friendlyError(error) };
        }
        if (!data || !data.booking) return { ok: false, error: (data && data.error) || 'Booking failed.' };
        const booking = mapBooking(data.booking);
        state.bookings = [booking, ...state.bookings.filter(b => b.id !== booking.id)];
        return { ok: true, booking };
    }

    function replaceBooking(row) {
        const b = mapBooking(row);
        state.bookings = state.bookings.map(x => (x.id === b.id ? b : x));
        return b;
    }

    async function cancelBooking(id) {
        const { data, error } = await sb().rpc('cancel_booking', { p_id: id });
        if (error) return { ok: false, error: friendlyError(error) };
        return { ok: true, booking: replaceBooking(data) };
    }

    async function updateBookingStatus(id, status) {
        if (!STATUSES.includes(status)) return { ok: false, error: 'Unknown status.' };
        const { data, error } = await sb().from('bookings').update({ status }).eq('id', id).select().single();
        if (error) {
            if (error.code === '23P01' || /bookings_no_overlap/.test(error.message)) {
                return { ok: false, error: 'Cannot restore: that slot has since been booked by someone else.' };
            }
            return { ok: false, error: friendlyError(error) };
        }
        return { ok: true, booking: replaceBooking(data) };
    }

    async function deleteBooking(id) {
        const { error } = await sb().from('bookings').delete().eq('id', id);
        if (error) return { ok: false, error: friendlyError(error) };
        state.bookings = state.bookings.filter(b => b.id !== id);
        return { ok: true };
    }

    /** UI hint only — the database enforces the real rule in cancel_booking(). */
    function canCancel(booking, email, now = new Date()) {
        if (!booking || booking.userEmail !== String(email || '').toLowerCase()) return false;
        if (!['Pending', 'Approved'].includes(booking.status)) return false;
        return booking.date >= localDateISO(now);
    }

    function isUpcoming(booking, now = new Date()) {
        return booking.date >= localDateISO(now) && !INACTIVE_STATUSES.includes(booking.status) && booking.status !== 'Completed';
    }

    function revenue(bookings = state.bookings) {
        return bookings
            .filter(b => !INACTIVE_STATUSES.includes(b.status) && b.paymentStatus === 'paid')
            .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    }

    // ---------------- Studios & instruments (admin) ----------------
    async function saveStudio(data) {
        const row = studioToRow(data);
        if (!row.name) return { ok: false, error: 'Studio name is required.' };
        if (!(row.hourly_rate > 0)) return { ok: false, error: 'Please enter a valid hourly rate.' };
        const q = row.id
            ? sb().from('studios').update(row).eq('id', row.id).select().single()
            : sb().from('studios').insert(row).select().single();
        const { data: saved, error } = await q;
        if (error) return { ok: false, error: friendlyError(error) };
        const studio = mapStudio(saved);
        const idx = state.studios.findIndex(s => s.id === studio.id);
        if (idx >= 0) state.studios[idx] = studio; else state.studios.push(studio);
        return { ok: true, studio };
    }

    async function deleteStudio(id) {
        const { error } = await sb().from('studios').delete().eq('id', id);
        if (error) return { ok: false, error: friendlyError(error) };
        state.studios = state.studios.filter(s => s.id !== id);
        return { ok: true };
    }

    async function saveInstrument(data) {
        const row = instrumentToRow(data);
        if (!row.name) return { ok: false, error: 'Instrument name is required.' };
        const q = row.id
            ? sb().from('instruments').update(row).eq('id', row.id).select().single()
            : sb().from('instruments').insert(row).select().single();
        const { data: saved, error } = await q;
        if (error) return { ok: false, error: friendlyError(error) };
        const instrument = mapInstrument(saved);
        const idx = state.instruments.findIndex(i => String(i.id) === String(instrument.id));
        if (idx >= 0) state.instruments[idx] = instrument; else state.instruments.push(instrument);
        return { ok: true, instrument };
    }

    async function deleteInstrument(id) {
        const { error } = await sb().from('instruments').delete().eq('id', id);
        if (error) return { ok: false, error: friendlyError(error) };
        state.instruments = state.instruments.filter(i => String(i.id) !== String(id));
        return { ok: true };
    }

    // ---------------- Reviews ----------------
    async function addFeedback(input) {
        const rating = parseInt(input.rating, 10);
        if (!rating || rating < 1 || rating > 5) return { ok: false, error: 'Please choose a star rating.' };
        const message = String(input.message || '').trim();
        if (message.length < 5) return { ok: false, error: 'Please write a short review (at least 5 characters).' };
        if (!getStudio(input.studioId)) return { ok: false, error: 'Please choose a studio.' };

        const { data, error } = await sb().from('feedbacks')
            .insert({ studio_id: input.studioId, rating, message, name: String(input.name || '').trim().slice(0, 60) })
            .select()
            .single();
        if (error) return { ok: false, error: friendlyError(error) };
        const feedback = mapFeedback(data);
        state.feedbacks = [feedback, ...state.feedbacks];
        return { ok: true, feedback };
    }

    async function toggleFeatured(id) {
        const f = state.feedbacks.find(x => x.id === id);
        if (!f) return { ok: false, error: 'Review not found.' };
        const { data, error } = await sb().from('feedbacks').update({ featured: !f.featured }).eq('id', id).select().single();
        if (error) return { ok: false, error: friendlyError(error) };
        const updated = mapFeedback(data);
        state.feedbacks = state.feedbacks.map(x => (x.id === id ? updated : x));
        return { ok: true, feedback: updated };
    }

    async function deleteFeedback(id) {
        const { error } = await sb().from('feedbacks').delete().eq('id', id);
        if (error) return { ok: false, error: friendlyError(error) };
        state.feedbacks = state.feedbacks.filter(f => f.id !== id);
        return { ok: true };
    }

    async function resolvePaymentIssue(id) {
        const { error } = await sb().from('payment_issues').update({ resolved: true }).eq('id', id);
        if (error) return { ok: false, error: friendlyError(error) };
        state.paymentIssues = state.paymentIssues.map(i => (i.id === id ? { ...i, resolved: true } : i));
        return { ok: true };
    }

    // ---------------- Export helpers ----------------
    function bookingsToCSV(bookings) {
        const cols = ['ref', 'userName', 'userEmail', 'phone', 'studioName', 'sessionType', 'date', 'time', 'hours', 'engineer', 'amount', 'currency', 'status', 'paymentStatus', 'paymentRef', 'createdAt', 'notes'];
        const esc = v => {
            let s = String(v ?? '');
            // Neutralise spreadsheet formula injection
            if (/^[=+\-@]/.test(s)) s = "'" + s;
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        return [cols.join(','), ...bookings.map(b => cols.map(c => esc(b[c])).join(','))].join('\n');
    }

    /** iCalendar file content so clients can add a session to their calendar. */
    function bookingToICS(b) {
        const [y, m, d] = b.date.split('-');
        const start = slotToHour(b.time);
        const dt = h => `${y}${m}${d}T${pad(h)}0000`;
        const clean = s => String(s || '').replace(/[\\,;]/g, ch => '\\' + ch).replace(/\n/g, '\\n');
        return [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//I Studio Records//Booking//EN',
            'BEGIN:VEVENT',
            `UID:${clean(b.id)}@istudiorecords`,
            `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
            `DTSTART:${dt(start)}`,
            `DTEND:${dt(start + b.hours)}`,
            `SUMMARY:${clean(b.sessionType + ' — ' + b.studioName)}`,
            `DESCRIPTION:${clean('Booking ref ' + b.ref + '. I Studio Records, Keta.')}`,
            'LOCATION:I Studio Records\\, Keta\\, Volta Region\\, Ghana',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');
    }

    const Store = {
        // constants
        OPEN_HOUR, CLOSE_HOUR, MAX_HOURS, ENGINEER_RATE, CURRENCY, SESSION_TYPES, STATUSES, MAX_DAYS_AHEAD,
        // lifecycle
        init, isReady, setClient,
        // utils
        escapeHTML, localDateISO, formatMoney, formatDate, generateRef, slotToHour, hourToSlot, friendlyError,
        // mapping (exported for tests)
        mapStudio, studioToRow, mapInstrument, instrumentToRow, mapBooking, mapFeedback,
        // catalogue
        getStudios, getStudio, getInstruments, getInstrument, getTestimonials,
        saveStudio, deleteStudio, saveInstrument, deleteInstrument,
        // bookings
        fetchTakenSlots, computeAvailability, getAvailability, calculatePrice, quote, book,
        getBookings, getBooking, getUserBookings, cancelBooking, updateBookingStatus, deleteBooking,
        canCancel, isUpcoming, revenue,
        // reviews & admin
        getFeedbacks, getUserFeedbacks, addFeedback, toggleFeatured, deleteFeedback,
        getProfiles, getPaymentIssues, resolvePaymentIssue,
        // export
        bookingsToCSV, bookingToICS
    };

    root.Store = Store;
    if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof window !== 'undefined' ? window : globalThis);
