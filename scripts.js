/* =============================================================
   I Studio Records — Shared app shell + home page + booking flow
   Depends on: auth.js, store.js
   ============================================================= */

const esc = (v) => Store.escapeHTML(v);

// Current session (kept on window so every script sees the same object)
window.user = getCurrentUser();

function refreshUser() {
    window.user = getCurrentUser();
    return window.user;
}

// Resolves once data is loaded and the header is wired up
let resolveAppReady;
window.appReady = new Promise(resolve => { resolveAppReady = resolve; });

// ============================================================
// TOASTS
// ============================================================
function showToast(msg, type = 'gold') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle', gold: 'music' };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const icon = document.createElement('i');
    icon.className = `fas fa-${icons[type] || 'music'}`;
    const text = document.createElement('span');
    text.textContent = msg;
    t.append(icon, text);
    container.appendChild(t);
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, 3800);
}
window.showToast = showToast;

// ============================================================
// MODALS (shared by every page)
// ============================================================
function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const focusable = modal.querySelector('input:not([type=hidden]):not([readonly]), select, textarea, button:not(.modal-close)');
    // Don't steal focus if the user has already started interacting with the modal
    if (focusable) setTimeout(() => {
        if (!modal.contains(document.activeElement)) focusable.focus({ preventScroll: true });
    }, 50);
}

function closeModal(elOrId) {
    const modal = typeof elOrId === 'string'
        ? document.getElementById(elOrId)
        : elOrId && elOrId.closest('.modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal[aria-hidden="false"]')) {
        document.body.classList.remove('modal-open');
    }
}
window.openModal = openModal;
window.closeModal = closeModal;

document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.modal-close, [data-close-modal]');
    if (closeBtn) {
        e.preventDefault();
        closeModal(closeBtn);
        return;
    }
    // Backdrop click
    if (e.target.classList && e.target.classList.contains('modal')) closeModal(e.target);
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.modal[aria-hidden="false"]')].pop();
    if (open) closeModal(open);
});

// ============================================================
// THEME
// ============================================================
function applyTheme(theme) {
    document.documentElement.setAttribute('data-color-scheme', theme);
    document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
        btn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
}

function currentTheme() {
    try {
        return localStorage.getItem('theme') || 'dark';
    } catch (e) {
        return 'dark';
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-theme-toggle')) return;
    e.preventDefault();
    const next = document.documentElement.getAttribute('data-color-scheme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', next); } catch (err) { /* private mode */ }
    applyTheme(next);
});

// ============================================================
// HEADER
// ============================================================
function updateHeaderUI() {
    const guestMenu = document.getElementById('guest-menu');
    const userMenu = document.getElementById('user-menu');
    const userGreeting = document.getElementById('user-greeting');
    if (!guestMenu || !userMenu) return;

    const u = window.user;
    if (u && u.loggedIn) {
        guestMenu.classList.add('menu-hidden');
        userMenu.classList.add('menu-visible');
        if (userGreeting) userGreeting.textContent = `Hi, ${String(u.name || '').split(' ')[0]}`;
        const dash = document.getElementById('dashboard-link');
        if (dash) {
            dash.href = u.isAdmin ? 'admin.html' : 'user-dashboard.html';
            dash.innerHTML = u.isAdmin
                ? '<i class="fas fa-sliders-h"></i> Admin'
                : '<i class="fas fa-th-large"></i> Dashboard';
        }
    } else {
        guestMenu.classList.remove('menu-hidden');
        userMenu.classList.remove('menu-visible');
        if (userGreeting) userGreeting.textContent = '';
    }
}
window.updateHeaderUI = updateHeaderUI;

function initHeader() {
    const header = document.querySelector('.header');
    if (!header) return;
    // Pages without the full-bleed hero always get the solid header
    if (!document.querySelector('.hero')) {
        header.classList.add('scrolled', 'solid');
    } else {
        const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 50);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    const toggle = document.getElementById('nav-toggle');
    const menu = document.querySelector('.nav-menu');
    if (toggle && menu) {
        toggle.addEventListener('click', () => {
            const open = menu.classList.toggle('open');
            header.classList.toggle('nav-open', open);
            toggle.setAttribute('aria-expanded', String(open));
            toggle.innerHTML = open ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
        });
        menu.addEventListener('click', (e) => {
            if (!e.target.closest('a')) return;
            menu.classList.remove('open');
            header.classList.remove('nav-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.innerHTML = '<i class="fas fa-bars"></i>';
        });
    }
}

async function logoutUser() {
    await signOut();
    window.user = getCurrentUser();
    window.location.href = 'index.html';
}
window.logoutUser = logoutUser;

document.addEventListener('click', (e) => {
    if (e.target.closest('#logout-btn, [data-action="logout"]')) {
        e.preventDefault();
        logoutUser();
    }
});

// ============================================================
// HOME PAGE RENDERING
// ============================================================
function renderStudios(studios) {
    const track = document.getElementById('studios-track');
    if (!track) return;
    if (!studios.length) {
        track.innerHTML = '<p class="text-muted">No studios available right now.</p>';
        return;
    }
    track.innerHTML = studios.map(studio => `
        <div class="carousel-slide">
            <article class="studio-card">
                <div class="studio-image">
                    <img src="${esc(studio.imageUrl)}" alt="${esc(studio.name)}" loading="lazy">
                    <span class="price-pill">${esc(Store.formatMoney(studio.hourlyRate))}<small>/hr</small></span>
                </div>
                <div class="studio-content">
                    <h3>${esc(studio.name)}</h3>
                    <p class="studio-meta"><i class="fas fa-map-marker-alt"></i> ${esc(studio.location)}</p>
                    <p>${esc(studio.description)}</p>
                    <div class="card-actions">
                        <button type="button" class="btn btn-ghost btn-sm" data-studio-details="${esc(studio.id)}">Details</button>
                        <button type="button" class="btn btn-primary btn-sm" data-book-studio="${esc(studio.id)}"><i class="fas fa-calendar-plus"></i> Book</button>
                    </div>
                </div>
            </article>
        </div>
    `).join('');
}

function renderInstruments(instruments) {
    const track = document.getElementById('instruments-track');
    if (!track) return;
    track.innerHTML = instruments.map(instrument => `
        <div class="carousel-slide">
            <article class="instrument-card">
                <div class="instrument-image">
                    <img src="${esc(instrument.imageUrl)}" alt="${esc(instrument.name)}" loading="lazy">
                </div>
                <div class="instrument-content">
                    <h3>${esc(instrument.name)}</h3>
                    <p>${esc(instrument.description)}</p>
                    <button type="button" class="btn btn-ghost btn-sm" data-instrument-details="${esc(instrument.id)}">Read more</button>
                </div>
            </article>
        </div>
    `).join('');
}

function starString(count) {
    const n = Math.min(5, Math.max(0, parseInt(count, 10) || 0));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function renderTestimonials(reviews) {
    const track = document.getElementById('reviews-track');
    if (!track) return;
    track.innerHTML = reviews.map(review => `
        <div class="review-card">
            ${review.avatarUrl
                ? `<img class="reviewer-photo" src="${esc(review.avatarUrl)}" alt="${esc(review.name)}" loading="lazy">`
                : `<div class="reviewer-photo reviewer-initials" aria-hidden="true">${esc(initials(review.name))}</div>`}
            <div class="reviewer-name">${esc(review.name)}</div>
            <div class="stars" aria-label="${esc(review.stars)} out of 5 stars">${starString(review.stars)}</div>
            <p class="review-text">"${esc(review.text)}"</p>
        </div>
    `).join('');
}

function renderHome() {
    renderStudios(Store.getStudios());
    renderInstruments(Store.getInstruments());
    renderTestimonials(Store.getTestimonials());
    const statStudios = document.getElementById('hero-stat-studios');
    if (statStudios) statStudios.textContent = Store.getStudios().length;
    updateCarouselView();
}

// ============================================================
// CAROUSELS
// ============================================================
const carousels = {
    studios: { currentIndex: 0 },
    instruments: { currentIndex: 0 },
    reviews: { currentIndex: 0 }
};

function isNativeScrollCarousel() {
    return window.matchMedia('(max-width: 480px)').matches;
}

function carouselMetrics(type) {
    const track = document.getElementById(`${type}-track`);
    if (!track || !track.children.length) return null;
    const wrapper = track.parentElement;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = track.children[0].getBoundingClientRect().width + gap;
    if (!step) return null;
    const perView = Math.max(1, Math.floor((wrapper.clientWidth + gap) / step));
    const maxIndex = Math.max(0, track.children.length - perView);
    return { track, step, maxIndex };
}

function updateCarouselNav(type, index, maxIndex) {
    const container = document.getElementById(`${type}-track`)?.closest('.carousel-container');
    if (!container) return;
    const prev = container.querySelector('.carousel-nav.prev');
    const next = container.querySelector('.carousel-nav.next');
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index >= maxIndex;
}

function moveCarousel(type, direction) {
    const carousel = carousels[type];
    const m = carouselMetrics(type);
    if (!carousel || !m) return;
    if (isNativeScrollCarousel()) {
        m.track.style.transform = '';
        m.track.scrollBy({ left: direction * m.step, behavior: 'smooth' });
        return;
    }
    carousel.currentIndex = Math.min(m.maxIndex, Math.max(0, carousel.currentIndex + direction));
    m.track.style.transform = `translateX(${-carousel.currentIndex * m.step}px)`;
    updateCarouselNav(type, carousel.currentIndex, m.maxIndex);
}
window.moveCarousel = moveCarousel;

function updateCarouselView() {
    Object.keys(carousels).forEach(type => {
        const m = carouselMetrics(type);
        if (!m) return;
        if (isNativeScrollCarousel()) {
            carousels[type].currentIndex = 0;
            m.track.style.transform = '';
            return;
        }
        carousels[type].currentIndex = Math.min(carousels[type].currentIndex, m.maxIndex);
        m.track.style.transform = `translateX(${-carousels[type].currentIndex * m.step}px)`;
        updateCarouselNav(type, carousels[type].currentIndex, m.maxIndex);
    });
}

function toggleFAQ(element) {
    const faqItem = element.closest('.faq-item');
    const isActive = faqItem.classList.contains('active');
    document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
        item.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
    });
    if (!isActive) {
        faqItem.classList.add('active');
        element.setAttribute('aria-expanded', 'true');
    }
}
window.toggleFAQ = toggleFAQ;

document.addEventListener('keydown', (e) => {
    const q = e.target.closest && e.target.closest('.faq-question');
    if (q && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggleFAQ(q);
    }
});

function initScrollAnimations() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
        items.forEach(el => el.classList.add('visible'));
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    items.forEach(el => observer.observe(el));
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// ============================================================
// BOOKING FLOW
// ============================================================
const bookingState = {
    studioId: null,
    sessionType: Store.SESSION_TYPES[0],
    hours: 1,
    date: '',
    time: '',
    engineer: false,
    ref: '',
    quote: null,
    step: 1,
    processing: false,
    slotsRequest: 0
};
window.bookingState = bookingState;

/**
 * Entry point for "Book" buttons. Requires sign-in; remembers the studio
 * so the booking resumes straight after login.
 */
function requestBooking(studioId) {
    const studio = Store.getStudio(studioId);
    if (!studio) {
        showToast('That studio is no longer available.', 'error');
        return;
    }
    if (!refreshUser().loggedIn) {
        sessionStorage.setItem('pendingBooking', studio.id);
        if (typeof window.openAuthModal === 'function') window.openAuthModal('login');
        showToast('Please sign in to book a studio', 'info');
        return;
    }
    openBookingModal(studio);
}
window.requestBooking = requestBooking;

function openBookingModal(studio) {
    if (!studio || !document.getElementById('advancedBookingModal')) return;
    const u = refreshUser();

    Object.assign(bookingState, {
        studioId: studio.id,
        sessionType: Store.SESSION_TYPES[0],
        hours: 1,
        date: Store.localDateISO(),
        time: '',
        engineer: false,
        ref: '',
        quote: null,
        processing: false
    });

    const img = document.getElementById('adv-booking-img');
    if (img) { img.src = studio.imageUrl; img.alt = studio.name; img.style.display = studio.imageUrl ? 'block' : 'none'; }
    document.getElementById('adv-booking-title').textContent = studio.name;
    document.getElementById('adv-booking-location').textContent = studio.location || '';
    document.getElementById('adv-booking-rate').textContent = `${Store.formatMoney(studio.hourlyRate)}/hr`;

    const sessionSel = document.getElementById('booking-session-type');
    sessionSel.innerHTML = Store.SESSION_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    sessionSel.value = bookingState.sessionType;

    document.querySelectorAll('.duration-chip').forEach(c => c.classList.toggle('selected', c.dataset.hours === '1'));
    document.getElementById('booking-engineer').checked = false;

    const dateInput = document.getElementById('adv-booking-date');
    dateInput.min = Store.localDateISO();
    const max = new Date();
    max.setDate(max.getDate() + Store.MAX_DAYS_AHEAD);
    dateInput.max = Store.localDateISO(max);
    dateInput.value = bookingState.date;

    document.getElementById('booking-name').value = u.name || '';
    document.getElementById('booking-email').value = u.email || '';
    document.getElementById('booking-phone').value = '';
    document.getElementById('booking-notes').value = '';
    document.getElementById('booking-error').textContent = '';
    setPayButtonBusy(false);

    renderTimeSlots();
    updatePriceSummary();
    bookingNextStep(1, true);
    openModal('advancedBookingModal');
}
window.openBookingModal = openBookingModal;

/** Fetch taken hours from the server and draw the slot grid. */
async function renderTimeSlots() {
    const container = document.getElementById('time-slots-container');
    if (!container) return;
    const nextBtn = document.getElementById('step1-next');
    const request = ++bookingState.slotsRequest;
    const { studioId, date, hours } = bookingState;

    nextBtn.disabled = true;
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = '<p class="slots-empty"><i class="fas fa-spinner fa-spin"></i> Checking availability…</p>';

    let availability;
    try {
        availability = await Store.getAvailability(studioId, date, hours);
    } catch (err) {
        console.error('Availability check failed:', err);
        if (request !== bookingState.slotsRequest) return;
        container.removeAttribute('aria-busy');
        container.innerHTML = '<p class="slots-empty"><i class="fas fa-exclamation-circle"></i> Could not load availability. <button type="button" class="btn btn-ghost btn-xs" data-retry-slots>Retry</button></p>';
        return;
    }
    // A newer request (date/duration changed) superseded this one
    if (request !== bookingState.slotsRequest) return;
    container.removeAttribute('aria-busy');

    // Drop the selection if it no longer fits the chosen duration
    if (bookingState.time && !availability.find(a => a.slot === bookingState.time && a.available)) {
        bookingState.time = '';
    }

    const anyOpen = availability.some(a => a.available);
    container.innerHTML = anyOpen
        ? availability.map(a => {
            const end = Store.hourToSlot(Store.slotToHour(a.slot) + bookingState.hours);
            return `<button type="button" class="time-slot-btn${a.slot === bookingState.time ? ' selected' : ''}"
                data-time="${a.slot}" ${a.available ? '' : `disabled title="${esc(a.reason)}"`}
                aria-pressed="${a.slot === bookingState.time}">
                ${a.slot}<small>– ${end}</small>
            </button>`;
        }).join('')
        : '<p class="slots-empty"><i class="fas fa-calendar-times"></i> No open slots for this date and duration. Try another day.</p>';

    nextBtn.disabled = !bookingState.time;
}

function updatePriceSummary() {
    const price = Store.calculatePrice(bookingState.studioId, bookingState.hours, bookingState.engineer);
    const el = document.getElementById('booking-price-live');
    if (el) {
        el.innerHTML = `<span>${price.hours} hr × ${esc(Store.formatMoney(price.rate))}${bookingState.engineer ? ` + engineer` : ''}</span>
            <strong>${esc(Store.formatMoney(price.total))}</strong>`;
    }
    return price;
}

function fillPaymentSummary(total) {
    const studio = Store.getStudio(bookingState.studioId);
    const price = Store.calculatePrice(bookingState.studioId, bookingState.hours, bookingState.engineer);
    const end = Store.hourToSlot(Store.slotToHour(bookingState.time) + bookingState.hours);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('pay-studio-name', studio ? studio.name : '');
    set('pay-session', bookingState.sessionType);
    set('pay-date', Store.formatDate(bookingState.date));
    set('pay-time', `${bookingState.time} – ${end}`);
    set('pay-duration', `${price.hours} hour${price.hours > 1 ? 's' : ''}`);
    set('pay-studio-cost', Store.formatMoney(price.studioCost));
    set('pay-engineer-cost', Store.formatMoney(price.engineerCost));
    document.getElementById('pay-engineer-row').style.display = bookingState.engineer ? '' : 'none';
    set('pay-total', Store.formatMoney(total));
    set('pay-amount-btn', Store.formatMoney(total));
}

function showBookingStep(step) {
    bookingState.step = step;
    document.querySelectorAll('#advancedBookingModal .booking-step').forEach(s => s.classList.remove('active'));
    document.getElementById('booking-step-' + step)?.classList.add('active');
    for (let i = 1; i <= 3; i++) {
        const prog = document.getElementById('prog-' + i);
        if (!prog) continue;
        prog.classList.toggle('done', i < step);
        prog.classList.toggle('active', i === step);
    }
    document.querySelector('#advancedBookingModal .booking-progress')?.classList.toggle('complete', step === 4);
    document.querySelector('#advancedBookingModal .modal-content')?.scrollTo({ top: 0 });
}

async function bookingNextStep(step, silent) {
    const errorEl = document.getElementById('booking-error');
    if (errorEl) errorEl.textContent = '';
    const fail = (msg) => { if (!silent) showToast(msg, 'error'); if (errorEl) errorEl.textContent = msg; };

    // Validation only applies when moving forward to steps 2–3; step 4
    // (confirmation) is shown after the booking already exists.
    if ((step === 2 || step === 3) && (!bookingState.date || !bookingState.time)) {
        return fail('Please select a date and time slot first.');
    }
    if (step === 3) {
        const name = document.getElementById('booking-name').value.trim();
        const phone = document.getElementById('booking-phone').value.trim();
        if (!name) return fail('Please enter your full name.');
        if (!/^\+?[0-9\s-]{9,16}$/.test(phone)) return fail('Please enter a valid phone number, e.g. +233 50 000 0000.');

        const btn = document.querySelector('#booking-step-2 [data-booking-step="3"]');
        if (btn) btn.disabled = true;
        // Ask the server for the real price and a fresh availability check
        const q = await Store.quote(bookingState);
        if (btn) btn.disabled = false;
        if (!q.ok) {
            showBookingStep(1);
            renderTimeSlots();
            return fail(q.error);
        }
        bookingState.quote = q;
        bookingState.ref = Store.generateRef();
        fillPaymentSummary(q.amount);
    }
    showBookingStep(step);
}
window.bookingNextStep = bookingNextStep;

// Booking modal inputs
document.addEventListener('change', (e) => {
    if (!e.target) return;
    if (e.target.id === 'adv-booking-date') {
        bookingState.date = e.target.value;
        bookingState.time = '';
        renderTimeSlots();
    } else if (e.target.id === 'booking-session-type') {
        bookingState.sessionType = e.target.value;
    } else if (e.target.id === 'booking-engineer') {
        bookingState.engineer = e.target.checked;
        updatePriceSummary();
    }
});

document.addEventListener('click', (e) => {
    const chip = e.target.closest('.duration-chip');
    if (chip) {
        e.preventDefault();
        bookingState.hours = parseInt(chip.dataset.hours, 10) || 1;
        document.querySelectorAll('.duration-chip').forEach(c => c.classList.toggle('selected', c === chip));
        renderTimeSlots();
        updatePriceSummary();
        return;
    }
    if (e.target.closest('[data-retry-slots]')) {
        e.preventDefault();
        renderTimeSlots();
        return;
    }
    const slot = e.target.closest('.time-slot-btn');
    if (slot && !slot.disabled) {
        e.preventDefault();
        bookingState.time = slot.dataset.time;
        document.querySelectorAll('.time-slot-btn').forEach(b => {
            b.classList.toggle('selected', b === slot);
            b.setAttribute('aria-pressed', String(b === slot));
        });
        document.getElementById('step1-next').disabled = false;
        return;
    }
    const step = e.target.closest('[data-booking-step]');
    if (step) {
        e.preventDefault();
        bookingNextStep(parseInt(step.dataset.bookingStep, 10));
        return;
    }
    if (e.target.closest('#pay-btn')) {
        e.preventDefault();
        initiatePaystackPayment();
        return;
    }
    if (e.target.closest('#booking-ics-btn')) {
        e.preventDefault();
        const b = Store.getBooking(e.target.closest('#booking-ics-btn').dataset.bookingId);
        if (b) downloadICS(b);
    }
});

function setPayButtonBusy(busy) {
    bookingState.processing = busy;
    const btn = document.getElementById('pay-btn');
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle('loading', busy);
}

function bookingPayload(reference) {
    const u = refreshUser();
    return {
        studioId: bookingState.studioId,
        sessionType: bookingState.sessionType,
        date: bookingState.date,
        time: bookingState.time,
        hours: bookingState.hours,
        engineer: bookingState.engineer,
        userName: document.getElementById('booking-name').value.trim() || u.name,
        phone: document.getElementById('booking-phone').value.trim(),
        notes: document.getElementById('booking-notes').value.trim(),
        reference
    };
}

async function initiatePaystackPayment() {
    if (bookingState.processing) return;
    const u = refreshUser();
    if (!u.loggedIn) {
        showToast('Your session expired. Please sign in again.', 'error');
        return;
    }
    setPayButtonBusy(true);

    // Re-check right before paying so nobody pays for a slot that's gone
    const q = await Store.quote(bookingState);
    if (!q.ok) {
        setPayButtonBusy(false);
        showBookingStep(1);
        renderTimeSlots();
        showToast(q.error, 'error');
        return;
    }

    const cfg = window.APP_CONFIG || {};
    const key = cfg.PAYSTACK_PUBLIC_KEY;
    if (typeof PaystackPop === 'undefined' || !key) {
        // No Paystack on this page — the server decides whether demo bookings are allowed
        finalizeBooking(bookingState.ref);
        return;
    }

    try {
        const studio = Store.getStudio(bookingState.studioId);
        const handler = PaystackPop.setup({
            key,
            email: u.email,
            amount: Math.round(q.amount * 100), // pesewas
            currency: cfg.PAYSTACK_CURRENCY || Store.CURRENCY,
            ref: bookingState.ref,
            metadata: {
                custom_fields: [
                    { display_name: 'Studio', variable_name: 'studio', value: studio ? studio.name : bookingState.studioId },
                    { display_name: 'Session', variable_name: 'session', value: bookingState.sessionType },
                    { display_name: 'Date', variable_name: 'date', value: bookingState.date },
                    { display_name: 'Time', variable_name: 'time', value: `${bookingState.time} (${bookingState.hours}h)` },
                    { display_name: 'Client Name', variable_name: 'client_name', value: document.getElementById('booking-name').value.trim() }
                ]
            },
            callback: function (response) {
                finalizeBooking(response.reference || bookingState.ref);
            },
            onClose: function () {
                if (bookingState.step === 3 && bookingState.processing) {
                    setPayButtonBusy(false);
                    showToast('Payment window closed — your booking was not made.', 'info');
                }
            }
        });
        handler.openIframe();
    } catch (err) {
        console.error('Paystack error:', err);
        setPayButtonBusy(false);
        showToast('Could not start payment. Please try again.', 'error');
    }
}
window.initiatePaystackPayment = initiatePaystackPayment;

/** Send the paid booking to the server, which verifies the payment and saves it. */
async function finalizeBooking(reference) {
    setPayButtonBusy(true);
    const result = await Store.book(bookingPayload(reference));
    setPayButtonBusy(false);

    if (!result.ok) {
        showToast(result.error, 'error');
        const errorEl = document.getElementById('booking-error');
        if (errorEl) errorEl.textContent = result.error;
        if (/taken|available/i.test(result.error)) {
            showBookingStep(1);
            renderTimeSlots();
        }
        return null;
    }

    const b = result.booking;
    const end = Store.hourToSlot(Store.slotToHour(b.time) + b.hours);
    document.getElementById('confirm-ref').textContent = b.ref;
    document.getElementById('confirm-details').innerHTML = `
        <div class="payment-summary-row"><span>Studio</span><span>${esc(b.studioName)}</span></div>
        <div class="payment-summary-row"><span>Session</span><span>${esc(b.sessionType)}</span></div>
        <div class="payment-summary-row"><span>When</span><span>${esc(Store.formatDate(b.date))}, ${esc(b.time)} – ${esc(end)}</span></div>
        <div class="payment-summary-row total"><span>${b.paymentStatus === 'paid' ? 'Paid' : 'Total (demo — not charged)'}</span><span class="price">${esc(Store.formatMoney(b.amount))}</span></div>`;
    document.getElementById('booking-ics-btn').dataset.bookingId = b.id;
    showBookingStep(4);
    showToast(`Booking request sent for ${b.studioName}!`, 'success');
    document.dispatchEvent(new CustomEvent('data:changed'));
    return b;
}
window.finalizeBooking = finalizeBooking;
function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.downloadFile = downloadFile;

function downloadICS(booking) {
    downloadFile(`${booking.ref}.ics`, Store.bookingToICS(booking), 'text/calendar');
}
window.downloadICS = downloadICS;

// Card buttons on the home page
document.addEventListener('click', (e) => {
    const bookBtn = e.target.closest('[data-book-studio]');
    if (bookBtn) {
        e.preventDefault();
        requestBooking(bookBtn.dataset.bookStudio);
        return;
    }
    const studioBtn = e.target.closest("[data-studio-details]");
    if (studioBtn && typeof window.showStudioDetails === 'function') {
        e.preventDefault();
        window.showStudioDetails(Store.getStudio(studioBtn.dataset.studioDetails));
        return;
    }
    const instrBtn = e.target.closest("[data-instrument-details]");
    if (instrBtn && typeof window.showInstrumentDetails === 'function') {
        e.preventDefault();
        window.showInstrumentDetails(Store.getInstrument(instrBtn.dataset.instrumentDetails));
    }
});

// ============================================================
// APP INITIALIZATION
// ============================================================
let appInitialized = false;

function showSetupBanner() {
    if (document.getElementById('setup-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'setup-banner';
    banner.className = 'setup-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<i class="fas fa-plug"></i> <span>The booking system isn\'t connected yet — add your Supabase URL and anon key to <code>config.js</code> (see SUPABASE_SETUP.md).</span>';
    document.body.prepend(banner);
}

/** Reload data for the current user (after sign-in, or when the tab regains focus). */
async function reloadData() {
    if (!isBackendConfigured()) return false;
    try {
        await refreshSession();
        refreshUser();
        updateHeaderUI();
        await Store.init(window.user);
        return true;
    } catch (error) {
        console.error('Could not load data:', error);
        showToast('Could not load studio data. Please check your connection and refresh.', 'error');
        return false;
    }
}
window.reloadData = reloadData;

async function initializeApp() {
    if (appInitialized) return;
    appInitialized = true;

    refreshUser();
    applyTheme(currentTheme());
    initHeader();
    updateHeaderUI();

    if (!isBackendConfigured()) {
        showSetupBanner();
    } else {
        await reloadData();
        onAuthChange((event) => {
            if (event === 'PASSWORD_RECOVERY' && typeof window.openResetPasswordModal === 'function') {
                window.openResetPasswordModal();
            }
            if (event === 'SIGNED_OUT') {
                window.user = getCurrentUser();
                updateHeaderUI();
            }
        });
    }

    if (document.getElementById('studios-track')) {
        renderHome();
        initScrollAnimations();
        window.addEventListener('resize', debounce(updateCarouselView, 200));
        handleBookingDeepLink();
    }

    resolveAppReady(window.user);
}
window.initializeApp = initializeApp;

// index.html?book=studio-a opens the booking modal directly (used by the dashboard)
function handleBookingDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const studioId = params.get('book');
    if (params.get('login') === '1' && !window.user.loggedIn && typeof window.openAuthModal === 'function') {
        window.openAuthModal('login');
    }
    if (!studioId) return;
    history.replaceState(null, '', window.location.pathname + '#studios');
    requestBooking(studioId);
}

// Apply the saved theme immediately to avoid a flash of the wrong theme
applyTheme(currentTheme());
