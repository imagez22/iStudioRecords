// End-to-end browser tests against a local Supabase stand-in.
//   npm run test:e2e        (needs Google Chrome/Chromium; set CHROME_PATH if not /usr/bin/google-chrome)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startFakeSupabase } from './fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE_PORT = 8765;
const SUPA_PORT = 54321;
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const CHROME = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
const ARTIFACTS = process.env.E2E_ARTIFACTS || join(ROOT, 'tests', 'e2e', 'artifacts');

// ---------------------------------------------------------------- servers
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
const site = http.createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, SITE).pathname);
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    if (!file.startsWith(ROOT) || /node_modules|\.git|supabase|tests/.test(path)) { res.writeHead(404); return res.end(); }
    try {
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(body);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(await readFile(join(ROOT, '404.html')).catch(() => 'Not found'));
    }
});
await new Promise(r => site.listen(SITE_PORT, '127.0.0.1', r));
const supa = await startFakeSupabase({ port: SUPA_PORT });

const TEST_CONFIG = `window.APP_CONFIG = {
    SUPABASE_URL: '${supa.url}',
    SUPABASE_ANON_KEY: '${supa.anonKey}',
    PAYSTACK_PUBLIC_KEY: 'pk_test_e2e',
    PAYSTACK_CURRENCY: 'GHS'
};`;

// Paystack stub: "completes" checkout by registering the transaction with the
// stand-in (so the server-side verification really runs), then calls back.
const PAYSTACK_STUB = `
window.PaystackPop = { setup(opts) {
    window.__paystack = opts;
    return { openIframe() {
        const amount = window.__underpay ? 100 : opts.amount;
        fetch('${supa.url}/__test/paystack', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference: opts.ref, amount, currency: opts.currency, email: opts.email }) })
          .then(() => opts.callback({ reference: opts.ref, status: 'success' }));
    } };
} };`;

const control = (path, body) => fetch(`${supa.url}/__test/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const sql = (q, params) => control('sql', { sql: q, params });

// ---------------------------------------------------------------- harness
const results = [];
const errors = [];
let step = '';
let currentPage = null;

async function check(name, fn) {
    step = name;
    try {
        await fn();
        results.push(['PASS', name]);
        console.log('✅ ' + name);
    } catch (e) {
        const msg = e.message.split('\n')[0];
        results.push(['FAIL', `${name} — ${msg}`]);
        console.log(`❌ ${name} — ${msg}`);
        if (currentPage) {
            try {
                console.log('   URL:', currentPage.url());
                await currentPage.screenshot({ path: join(ARTIFACTS, `fail-${results.length}.png`) });
            } catch { /* page gone */ }
        }
    }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function futureDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const DATE = futureDate(10);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function newContext(opts = {}, { configured = true } = {}) {
    const ctx = await browser.newContext({ acceptDownloads: true, ...opts });
    ctx.setDefaultTimeout(8000);
    ctx.setDefaultNavigationTimeout(10000);
    await ctx.route('**/config.js*', route => route.fulfill({
        contentType: 'application/javascript',
        body: configured ? TEST_CONFIG : `window.APP_CONFIG = { SUPABASE_URL: '', SUPABASE_ANON_KEY: '', PAYSTACK_PUBLIC_KEY: 'pk_test_e2e' };`
    }));
    await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@*/dist/umd/supabase.js', async route => route.fulfill({
        contentType: 'application/javascript',
        body: await readFile(join(ROOT, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), 'utf8')
    }));
    await ctx.route('https://js.paystack.co/**', route => route.fulfill({ contentType: 'application/javascript', body: PAYSTACK_STUB }));
    await ctx.route(/^https:\/\/(images\.unsplash\.com|fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com)\//, route => route.abort());
    ctx.on('page', p => watch(p));
    return ctx;
}

function watch(page) {
    page.on('pageerror', e => errors.push(`[pageerror @ ${step}] ${e.message}`));
    page.on('console', m => {
        if (m.type() !== 'error') return;
        const t = m.text();
        // Expected: blocked third-party assets, and HTTP 4xx from deliberate negative tests
        if (/ERR_FAILED|ERR_BLOCKED|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(t)) return;
        errors.push(`[console @ ${step}] ${t}`);
    });
}

async function logout(p) {
    await Promise.all([p.waitForNavigation(), p.click('#logout-btn')]);
    await p.waitForSelector('#login-signup-btn', { state: 'visible' });
}

async function signupVia(p, name, email, password = 'password123') {
    await p.click('#login-signup-btn');
    await p.click('#showSignup');
    await p.fill('#signup-name', name);
    await p.fill('#signup-email', email);
    await p.fill('#signup-password', password);
    await p.fill('#signup-confirm', password);
    await p.click('#signup-btn');
}

async function loginVia(p, email, password = 'password123') {
    await p.click('#login-signup-btn');
    await p.fill('#login-email', email);
    await p.fill('#login-password', password);
    await p.click('#login-btn');
}

async function pickSlotAndContinue(p, { studio, time, hours = 1, phone = '+233 50 123 4567' }) {
    if (studio) {
        await p.goto(`${SITE}/index.html?book=${studio}`);
        await p.waitForSelector('#advancedBookingModal[aria-hidden="false"]');
    }
    if (hours > 1) await p.locator(`.duration-chip[data-hours="${hours}"]`).click();
    await p.fill('#adv-booking-date', DATE);
    await p.locator(`.time-slot-btn[data-time="${time}"]:not([disabled])`).click();
    await p.click('#step1-next');
    await p.fill('#booking-phone', phone);
    await p.locator('#booking-step-2 [data-booking-step="3"]').click();
    await p.waitForSelector('#booking-step-3.active');
}

// ---------------------------------------------------------------- desktop
const ctx = await newContext({ viewport: { width: 1366, height: 860 } });
const page = await ctx.newPage();
currentPage = page;

await check('home page loads the catalogue from the database', async () => {
    await page.goto(`${SITE}/index.html`);
    await page.waitForSelector('#studios-track .studio-card');
    assert(await page.locator('#studios-track .studio-card').count() === 5, 'studios');
    assert(await page.locator('#instruments-track .instrument-card').count() === 6, 'instruments');
    assert(await page.locator('#reviews-track .review-card').count() === 4, 'testimonials');
    assert((await page.locator('.price-pill').first().innerText()).includes('GH₵250'), 'price pill');
    assert(await page.locator('#setup-banner').count() === 0, 'setup banner should not show when configured');
});

await check('carousel, FAQ and detail modals work', async () => {
    const next = page.locator('#studios .carousel-nav.next');
    const prev = page.locator('#studios .carousel-nav.prev');
    assert(await prev.isDisabled());
    await next.click();
    await page.waitForTimeout(500);
    while (!(await prev.isDisabled())) await prev.click();
    await page.waitForTimeout(500);
    await page.locator('.faq-question').first().click();
    assert(await page.locator('.faq-item.active').count() === 1);
    await page.locator('[data-studio-details="studio-b"]').click();
    assert((await page.locator('#modal-studio-rate').innerText()).includes('GH₵200'));
    await page.keyboard.press('Escape');
    await page.locator('[data-instrument-details="3"]').click();
    assert((await page.locator('#modal-instr-title').innerText()) === 'Piano');
    await page.keyboard.press('Escape');
});

await check('booking while signed out asks to sign in; bad password is rejected', async () => {
    await page.locator('[data-book-studio="studio-a"]').click();
    await page.waitForSelector('#authModal[aria-hidden="false"]');
    await page.fill('#login-email', 'nobody@example.com');
    await page.fill('#login-password', 'wrongpass1');
    await page.press('#login-password', 'Enter');
    await page.waitForFunction(() => document.getElementById('login-error').textContent.length > 0);
    assert((await page.locator('#login-error').innerText()) === 'Invalid email or password.');
});

await check('forgot-password sends a reset request', async () => {
    await page.fill('#login-email', 'kofi@example.com');
    await page.click('#forgot-password-link');
    await page.waitForFunction(() => document.getElementById('login-info').textContent.includes('reset link'));
});

await check('sign-up validates, then creates the account and resumes the booking', async () => {
    await page.click('#showSignup');
    await page.fill('#signup-name', 'Kofi Mensah');
    await page.fill('#signup-email', 'Kofi@Example.com');
    await page.fill('#signup-password', 'short');
    await page.fill('#signup-confirm', 'short');
    await page.click('#signup-btn');
    assert((await page.locator('#signup-error').innerText()).includes('at least 8'));
    await page.fill('#signup-password', 'password123');
    await page.fill('#signup-confirm', 'password123');
    await page.click('#signup-btn');
    await page.waitForSelector('#advancedBookingModal[aria-hidden="false"]');
    assert((await page.locator('#adv-booking-title').innerText()) === 'The Warmth Room');
    assert((await page.locator('#user-greeting').innerText()).includes('Kofi'));
    const rows = await sql(`select name, email, is_admin from public.profiles where email = 'kofi@example.com'`);
    assert(rows.length === 1 && rows[0].name === 'Kofi Mensah' && rows[0].is_admin === false, JSON.stringify(rows));
});

await check('step 1: duration, date, slot and engineer update the live price', async () => {
    await page.locator('.duration-chip[data-hours="2"]').click();
    await page.fill('#adv-booking-date', DATE);
    await page.locator('.time-slot-btn[data-time="14:00"]:not([disabled])').click();
    await page.check('#booking-engineer');
    assert((await page.locator('#booking-price-live strong').innerText()) === 'GH₵700');
    assert(await page.locator('.time-slot-btn[data-time="20:00"]').isDisabled(), '20:00 cannot fit 2h');
    await page.click('#step1-next');
});

await check('step 2 → 3: phone validation, then the server quotes the price', async () => {
    await page.fill('#booking-phone', '12');
    await page.locator('#booking-step-2 [data-booking-step="3"]').click();
    assert((await page.locator('#booking-error').innerText()).includes('valid phone'));
    await page.fill('#booking-phone', '+233 50 123 4567');
    await page.fill('#booking-notes', 'Need 2 vocal mics');
    await page.locator('#booking-step-2 [data-booking-step="3"]').click();
    await page.waitForSelector('#booking-step-3.active');
    assert((await page.locator('#pay-total').innerText()) === 'GH₵700');
    assert((await page.locator('#pay-time').innerText()) === '14:00 – 16:00');
});

await check('Paystack payment is verified by the server and the booking is saved', async () => {
    await page.click('#pay-btn');
    await page.waitForSelector('#booking-step-4.active');
    const ps = await page.evaluate(() => ({ amount: window.__paystack.amount, currency: window.__paystack.currency, email: window.__paystack.email, ref: window.__paystack.ref }));
    assert(ps.amount === 70000 && ps.currency === 'GHS' && ps.email === 'kofi@example.com', JSON.stringify(ps));
    assert((await page.locator('#confirm-ref').innerText()) === ps.ref);
    const rows = await sql(`select amount, payment_status, status, start_hour, hours, engineer, notes, user_email from public.bookings where ref = $1`, [ps.ref]);
    assert(rows.length === 1, 'booking not in database');
    const b = rows[0];
    assert(Number(b.amount) === 700 && b.payment_status === 'paid' && b.status === 'Pending' && b.start_hour === 14 && b.hours === 2 && b.engineer && b.notes === 'Need 2 vocal mics' && b.user_email === 'kofi@example.com', JSON.stringify(b));
});

await check('add-to-calendar downloads an .ics file', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#booking-ics-btn')]);
    assert(dl.suggestedFilename().endsWith('.ics'));
    await page.keyboard.press('Escape');
});

await check('booked hours are blocked for everyone (server availability)', async () => {
    await page.locator('[data-book-studio="studio-a"]').click();
    await page.fill('#adv-booking-date', DATE);
    await page.waitForSelector('.time-slot-btn[data-time="14:00"]');
    assert(await page.locator('.time-slot-btn[data-time="14:00"]').isDisabled(), '14:00');
    assert(await page.locator('.time-slot-btn[data-time="15:00"]').isDisabled(), '15:00');
    assert(!(await page.locator('.time-slot-btn[data-time="16:00"]').isDisabled()), '16:00');
    await page.locator('.duration-chip[data-hours="2"]').click();
    await page.waitForSelector('.time-slot-btn[data-time="13:00"]');
    assert(await page.locator('.time-slot-btn[data-time="13:00"]').isDisabled(), '13:00 + 2h overlaps');
    await page.keyboard.press('Escape');
});

await check('tampering from the browser console is blocked by the database', async () => {
    const r = await page.evaluate(async (date) => {
        const sb = window.getSupabase();
        const { data: { user } } = await sb.auth.getUser();
        const direct = await sb.rpc('create_booking', {
            p_user_id: user.id, p_studio_id: 'studio-b', p_session_type: 'Recording Session', p_date: date, p_start_hour: 10,
            p_hours: 1, p_engineer: false, p_user_name: 'x', p_phone: '0501234567', p_notes: '', p_ref: 'HACK-1',
            p_payment_ref: 'HACK-1', p_payment_status: 'paid', p_amount_paid: 0 });
        const insert = await sb.from('bookings').insert({ ref: 'HACK-2', user_id: user.id, user_name: 'x', user_email: 'x@x.com',
            phone: '0501234567', studio_id: 'studio-b', studio_name: 'x', session_type: 'Recording Session', date,
            start_hour: 10, hours: 1, amount: 0, payment_status: 'paid' });
        const approve = await sb.from('bookings').update({ status: 'Approved' }).eq('user_id', user.id).select();
        const admin = await sb.from('profiles').update({ is_admin: true }).eq('id', user.id);
        const studio = await sb.from('studios').update({ hourly_rate: 1 }).eq('id', 'studio-a').select();
        const others = await sb.from('profiles').select('*');
        return {
            direct: direct.error && direct.error.code, insert: insert.error && insert.error.code,
            approved: approve.data ? approve.data.length : -1, admin: admin.error && admin.error.code,
            studioRows: studio.data ? studio.data.length : -1, profiles: others.data.length
        };
    }, DATE);
    assert(r.direct === '42501', 'create_booking callable: ' + JSON.stringify(r));
    assert(r.insert === '42501', 'direct insert allowed: ' + JSON.stringify(r));
    assert(r.approved === 0, 'self-approval allowed: ' + JSON.stringify(r));
    assert(r.admin === '42501', 'self-promotion allowed: ' + JSON.stringify(r));
    assert(r.studioRows === 0, 'price change allowed: ' + JSON.stringify(r));
    assert(r.profiles === 1, 'can read other profiles: ' + JSON.stringify(r));
    const rate = await sql(`select hourly_rate from public.studios where id = 'studio-a'`);
    assert(Number(rate[0].hourly_rate) === 250);
});

await check('underpaying via a tampered checkout is refused and logged for refund', async () => {
    await pickSlotAndContinue(page, { studio: 'studio-c', time: '10:00' });
    await page.evaluate(() => { window.__underpay = true; });
    await page.click('#pay-btn');
    await page.waitForFunction(() => document.getElementById('booking-error').textContent.includes('does not match'));
    await page.evaluate(() => { window.__underpay = false; });
    const issues = await sql(`select amount, reason from public.payment_issues`);
    assert(issues.length === 1 && Number(issues[0].amount) === 1, JSON.stringify(issues));
    const booked = await sql(`select count(*)::int n from public.bookings where studio_id = 'studio-c'`);
    assert(booked[0].n === 0, 'underpaid booking was saved');
    await page.keyboard.press('Escape');
});

await check('dashboard shows bookings and stats from the database', async () => {
    await page.goto(`${SITE}/user-dashboard.html`);
    await page.waitForSelector('#recent-bookings-list .booking-card');
    assert((await page.locator('#total-bookings').innerText()) === '1');
    assert((await page.locator('#upcoming-bookings').innerText()) === '1');
    assert((await page.locator('#hours-booked').innerText()) === '2');
    assert(await page.locator('.next-session-card').isVisible());
    await page.click('.dash-nav-item[data-tab="bookings"]');
    await page.click('.filter-chip[data-filter="past"]');
    assert(await page.locator('#bookings-list .booking-card').count() === 0);
    await page.click('.filter-chip[data-filter="upcoming"]');
    assert(await page.locator('#bookings-list .booking-card').count() === 1);
});

await check('client can cancel; the database releases the slot', async () => {
    page.once('dialog', d => d.accept());
    await page.locator('#bookings-list [data-cancel]').click();
    await page.waitForSelector('#bookings-list .status-cancelled, #bookings-list .empty-state');
    const rows = await sql(`select status from public.bookings where studio_id = 'studio-a'`);
    assert(rows[0].status === 'Cancelled', JSON.stringify(rows));
    const hours = await sql(`select public.get_booked_hours('studio-a', $1::date) h`, [DATE]);
    assert(hours[0].h.length === 0, 'slot not released');
});

await check('client can post a review; it stays private until featured', async () => {
    await page.click('.dash-nav-item[data-tab="reviews"]');
    await page.locator('#tab-reviews [data-action="leave-review"]').first().click();
    await page.waitForSelector('#feedbackModal[aria-hidden="false"]');
    await page.click('#submit-feedback-btn');
    await page.waitForFunction(() => document.getElementById('feedback-error').textContent.includes('star rating'));
    await page.click('label[for="star4"]');
    await page.selectOption('#feedback-studio-select', 'studio-c');
    await page.fill('#feedback-message', 'Great live room, <b>loud</b> drums!');
    await page.click('#submit-feedback-btn');
    await page.waitForSelector('#reviews-list .feedback-card');
    const txt = await page.locator('#reviews-list .feedback-card').innerText();
    assert(txt.includes('Raw Tracks Studio') && txt.includes('<b>loud</b>'), txt);
    const rows = await sql(`select rating, featured, user_email, studio_name from public.feedbacks`);
    assert(rows.length === 1 && rows[0].rating === 4 && rows[0].featured === false && rows[0].user_email === 'kofi@example.com', JSON.stringify(rows));
});

await check('logout ends the Supabase session', async () => {
    await page.goto(`${SITE}/index.html`);
    await page.waitForSelector('#logout-btn', { state: 'visible' });
    await logout(page);
    const hasSession = await page.evaluate(async () => !!(await window.getSupabase().auth.getSession()).data.session);
    assert(!hasSession, 'session still present');
});

await check('guests are redirected away from the dashboard and admin panel', async () => {
    await page.goto(`${SITE}/admin.html`);
    await page.waitForURL('**/index.html?login=1');
    await page.waitForSelector('#authModal[aria-hidden="false"]');
    await page.goto(`${SITE}/user-dashboard.html`);
    await page.waitForURL('**/index.html?login=1');
    await page.click('#authModal .modal-close');
});

await check('XSS payloads in names and notes are rendered inert', async () => {
    await signupVia(page, '<img src=x onerror="window.__xss=1">', 'evil@example.com');
    await page.waitForURL('**/user-dashboard.html');
    await page.waitForSelector('#user-name');
    await pickSlotAndContinue(page, { studio: 'studio-d', time: '12:00' });
    await page.click('#pay-btn');
    await page.waitForSelector('#booking-step-4.active');
    assert(!(await page.evaluate(() => window.__xss)), 'xss fired');
    await page.goto(`${SITE}/index.html`);
    await page.waitForSelector('#logout-btn', { state: 'visible' });
    await logout(page);
});

await check('signed-in clients are sent from the admin panel to their dashboard', async () => {
    await loginVia(page, 'kofi@example.com');
    await page.waitForURL('**/user-dashboard.html');
    await page.goto(`${SITE}/admin.html`);
    await page.waitForURL('**/user-dashboard.html');
    await page.waitForSelector('#logout-btn', { state: 'visible' });
    await logout(page);
});

await check('the studio owner becomes admin and lands on the admin panel', async () => {
    await signupVia(page, 'Studio Owner', 'owner@example.com');
    await page.waitForURL('**/user-dashboard.html');
    await control('make-admin', { email: 'owner@example.com' });
    await page.goto(`${SITE}/index.html`);
    await page.waitForSelector('#logout-btn', { state: 'visible' });
    await logout(page);
    await loginVia(page, 'owner@example.com');
    await page.waitForURL('**/admin.html');
    await page.waitForSelector('#recent-bookings-table tr td');
    assert((await page.locator('#stat-total-bookings').innerText()) === '2');
    assert((await page.locator('#stat-pending').innerText()) === '1');
    assert((await page.locator('#stat-revenue').innerText()) === 'GH₵180', 'revenue ' + await page.locator('#stat-revenue').innerText());
    assert(!(await page.locator('#issues-alert').isHidden()), 'payment issue alert should show');
    assert(!(await page.evaluate(() => window.__xss)), 'xss fired in admin');
});

await check('admin resolves the payment issue', async () => {
    await page.click('#issues-alert');
    await page.locator('[data-resolve-issue]').click();
    await page.waitForSelector('#payments-table .status-approved');
    const rows = await sql(`select resolved from public.payment_issues`);
    assert(rows[0].resolved === true);
    assert(await page.locator('#issues-alert').isHidden());
});

await check('admin can search, filter, approve and export bookings', async () => {
    await page.click('.admin-sidebar-nav a[data-section="bookings"]');
    assert(await page.locator('#all-bookings-table tr').count() === 2);
    await page.fill('#booking-search', 'evil@');
    assert(await page.locator('#all-bookings-table tr').count() === 1);
    await page.fill('#booking-search', '');
    await page.selectOption('#booking-status-filter', 'Cancelled');
    assert(await page.locator('#all-bookings-table tr').count() === 1);
    await page.selectOption('#booking-status-filter', '');
    await page.locator('#all-bookings-table [data-booking-status="Approved"]').first().click();
    await page.waitForSelector('#all-bookings-table .status-approved');
    const rows = await sql(`select status from public.bookings where studio_id = 'studio-d'`);
    assert(rows[0].status === 'Approved', JSON.stringify(rows));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv-btn')]);
    assert(dl.suggestedFilename().endsWith('.csv'));
});

await check('restoring a booking into a slot someone else took is refused', async () => {
    // Someone else books the slot Kofi cancelled
    await sql(`select public.create_booking(id, 'studio-a', 'Recording Session', $1::date, 14, 1, false, '', '0501234567', '', 'ISR-OTHER', 'ISR-OTHER', 'demo', 0) from public.profiles where email = 'owner@example.com'`, [DATE]);
    await page.click('#refresh-btn');
    await page.waitForFunction(() => document.querySelectorAll('#all-bookings-table tr').length === 3);
    await page.locator('#all-bookings-table tr', { hasText: 'kofi@example.com' }).locator('[data-booking-status="Pending"]').click();
    await page.waitForSelector('.toast-error');
    assert((await page.locator('.toast-error').last().innerText()).includes('since been booked'));
});

await check('admin can add a studio and edit a rate', async () => {
    await page.click('.admin-sidebar-nav a[data-section="studios"]');
    await page.click('#add-studio-btn');
    await page.fill('#studio-name', 'Vocal Booth X');
    await page.fill('#studio-location', 'Annex');
    await page.fill('#studio-rate', '150');
    await page.fill('#studio-image-url', 'images/mic.jpg');
    await page.fill('#studio-description', 'Tight vocal booth');
    await page.fill('#studio-long-description', 'A small dead room for vocals.');
    await page.click('#save-studio-btn');
    await page.waitForFunction(() => document.querySelectorAll('#studios-table tr').length === 6);
    await page.locator('[data-edit-studio="studio-b"]').click();
    await page.fill('#studio-rate', '210');
    await page.click('#save-studio-btn');
    await page.waitForFunction(() => document.getElementById('studios-table').textContent.includes('GH₵210/hr'));
    const rows = await sql(`select hourly_rate from public.studios where id = 'studio-b'`);
    assert(Number(rows[0].hourly_rate) === 210);
});

await check('admin can add and delete an instrument', async () => {
    await page.click('.admin-sidebar-nav a[data-section="instruments"]');
    await page.click('#add-instrument-btn');
    await page.fill('#instrument-name', 'Kalimba');
    await page.fill('#instrument-image-url', 'images/piano.jpg');
    await page.fill('#instrument-description', 'Thumb piano');
    await page.click('#save-instrument-btn');
    await page.waitForFunction(() => document.querySelectorAll('#instruments-table tr').length === 7);
    page.once('dialog', d => d.accept());
    await page.locator('#instruments-table tr', { hasText: 'Kalimba' }).locator('[data-delete-instrument]').click();
    await page.waitForFunction(() => document.querySelectorAll('#instruments-table tr').length === 6);
});

await check('admin features a review; users list shows all accounts', async () => {
    await page.click('.admin-sidebar-nav a[data-section="feedback"]');
    await page.locator('[data-feature]').first().click();
    await page.waitForSelector('[data-feature][aria-pressed="true"]');
    await page.click('.admin-sidebar-nav a[data-section="users"]');
    assert(await page.locator('#users-table tr').count() === 3);
});

await check('admin changes appear on the public site', async () => {
    await page.goto(`${SITE}/index.html`);
    await page.waitForSelector('#studios-track .studio-card');
    assert(await page.locator('#studios-track .studio-card').count() === 6, 'new studio');
    assert(await page.locator('#reviews-track .review-card').count() === 5, 'featured review');
    assert((await page.locator('#dashboard-link').getAttribute('href')) === 'admin.html');
});

await check('theme toggle persists across reloads', async () => {
    const before = await page.evaluate(() => document.documentElement.dataset.colorScheme);
    await page.click('#theme-toggle');
    await page.reload();
    await page.waitForSelector('#studios-track .studio-card');
    assert((await page.evaluate(() => document.documentElement.dataset.colorScheme)) !== before);
    await page.click('#theme-toggle');
});

await check('demo mode: bookings without Paystack only when the server allows it', async () => {
    await control('env', { PAYSTACK_SECRET_KEY: '', ALLOW_DEMO_PAYMENTS: '' });
    await pickSlotAndContinue(page, { studio: 'studio-e', time: '11:00' });
    await page.evaluate(() => { window.__pop = window.PaystackPop; delete window.PaystackPop; });
    await page.click('#pay-btn');
    await page.waitForFunction(() => document.getElementById('booking-error').textContent.includes('not configured'));
    await control('env', { ALLOW_DEMO_PAYMENTS: 'true' });
    await page.click('#pay-btn');
    await page.waitForSelector('#booking-step-4.active');
    assert((await page.locator('#confirm-details').innerText()).includes('not charged'));
    const rows = await sql(`select payment_status from public.bookings where studio_id = 'studio-e'`);
    assert(rows[0].payment_status === 'demo');
    await page.evaluate(() => { window.PaystackPop = window.__pop; });
    await control('env', { PAYSTACK_SECRET_KEY: 'sk_test_fake', ALLOW_DEMO_PAYMENTS: '' });
    await page.keyboard.press('Escape');
});

await check('404 page renders', async () => {
    await page.goto(`${SITE}/missing-page.html`);
    assert((await page.locator('h1').innerText()).includes('Page Not Found'));
});

await page.goto(`${SITE}/index.html`);
await page.waitForSelector('#studios-track .studio-card');
await page.screenshot({ path: join(ARTIFACTS, 'home.png') });
await ctx.close();

// ---------------------------------------------------------------- not configured
const nctx = await newContext({ viewport: { width: 1280, height: 800 } }, { configured: false });
const np = await nctx.newPage();
currentPage = np;
await check('without Supabase config the site explains how to connect it (no crash)', async () => {
    await np.goto(`${SITE}/index.html`);
    await np.waitForSelector('#setup-banner');
    assert((await np.locator('#setup-banner').innerText()).includes('config.js'));
    await np.click('#login-signup-btn');
    await np.fill('#login-email', 'a@b.com');
    await np.fill('#login-password', 'password123');
    await np.click('#login-btn');
    await np.waitForFunction(() => document.getElementById('login-error').textContent.includes('not connected'));
});
await nctx.close();

// ---------------------------------------------------------------- mobile
const mctx = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const m = await mctx.newPage();
currentPage = m;
async function noHorizontalOverflow(p) {
    const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    assert(r.sw <= r.w + 1, `page overflows horizontally: ${r.sw} > ${r.w}`);
}

await check('mobile: menu toggles and nothing overflows', async () => {
    await m.goto(`${SITE}/index.html`);
    await m.waitForSelector('#studios-track .studio-card');
    await noHorizontalOverflow(m);
    await m.click('#nav-toggle');
    await m.waitForTimeout(200);
    assert(await m.locator('#nav-menu a[href="index.html#faq"]').isVisible());
    await m.click('#nav-menu a[href="index.html#faq"]');
});

await check('mobile: sign-up and a full booking', async () => {
    await signupVia(m, 'Ama Owusu', 'ama@example.com');
    await m.waitForURL('**/user-dashboard.html');
    await noHorizontalOverflow(m);
    assert(await m.locator('.dashboard-sidebar').isVisible(), 'tab strip hidden');
    await pickSlotAndContinue(m, { studio: 'studio-e', time: '15:00' });
    await m.click('#pay-btn');
    await m.waitForSelector('#booking-step-4.active');
    await noHorizontalOverflow(m);
    await m.screenshot({ path: join(ARTIFACTS, 'mobile-confirm.png') });
});
await mctx.close();

await browser.close();
await supa.close();
site.close();

const passed = results.filter(r => r[0] === 'PASS').length;
console.log(`\n${passed}/${results.length} passed`);
if (errors.length) {
    console.log('\nJS errors captured:');
    errors.forEach(e => console.log('  ' + e));
} else {
    console.log('No JS errors or console errors captured.');
}
process.exit(passed === results.length && !errors.length ? 0 : 1);
