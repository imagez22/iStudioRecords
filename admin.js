/* =============================================================
   I Studio Records — Admin Panel
   Depends on: auth.js, store.js, scripts.js
   Every change is written to Supabase; row-level security only
   allows it for accounts with profiles.is_admin = true.
   ============================================================= */
(function () {
    'use strict';

    const e = Store.escapeHTML;
    const SECTION_TITLES = {
        dashboard: 'Dashboard', bookings: 'Bookings', studios: 'Studios',
        instruments: 'Instruments', feedback: 'Client Reviews', users: 'Users', payments: 'Payment Issues'
    };
    const bookingFilters = { search: '', status: '' };

    // ===================== HELPERS =====================
    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function emptyRow(cols, text) {
        return `<tr><td colspan="${cols}" class="table-empty">${e(text)}</td></tr>`;
    }

    function endTime(b) {
        return Store.hourToSlot(Store.slotToHour(b.time) + b.hours);
    }

    function newestFirst(list) {
        return [...list].sort((a, b) => (b.createdAt + b.id).localeCompare(a.createdAt + a.id));
    }

    /** Run an async store action with the button disabled, then toast + re-render. */
    async function run(button, action, successMessage) {
        if (button) button.disabled = true;
        const res = await action();
        if (button && document.body.contains(button)) button.disabled = false;
        if (res && res.ok === false) {
            showToast(res.error, 'error');
            return res;
        }
        if (successMessage) showToast(typeof successMessage === 'function' ? successMessage(res) : successMessage, 'success');
        renderAll();
        return res;
    }

    // ===================== STATS =====================
    function updateStats() {
        const bookings = Store.getBookings();
        const pending = bookings.filter(b => b.status === 'Pending').length;
        const upcoming = bookings.filter(b => Store.isUpcoming(b)).length;
        const feedbacks = Store.getFeedbacks();
        const avg = feedbacks.length ? feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length : 0;
        const openIssues = Store.getPaymentIssues().filter(i => !i.resolved).length;

        setText('stat-total-bookings', bookings.length);
        setText('stat-upcoming-trend', `${upcoming} upcoming`);
        setText('stat-pending', pending);
        setText('stat-revenue', Store.formatMoney(Store.revenue()));
        setText('stat-reviews', feedbacks.length);
        setText('stat-rating', feedbacks.length ? `★ ${avg.toFixed(1)} average` : 'No ratings yet');
        setText('nav-pending-count', pending || '');
        setText('nav-issues-count', openIssues || '');
        const alert = document.getElementById('issues-alert');
        if (alert) alert.hidden = !openIssues;
        setText('issues-alert-count', openIssues);
    }

    // ===================== BOOKINGS =====================
    function bookingActions(b) {
        const btn = (status, icon, title, cls = 'btn-ghost') =>
            `<button type="button" class="btn ${cls} btn-icon" data-booking-status="${status}" data-id="${e(b.id)}" title="${title}" aria-label="${title}"><i class="fas fa-${icon}"></i></button>`;
        const actions = [];
        if (b.status === 'Pending') {
            actions.push(btn('Approved', 'check', 'Approve', 'btn-success'));
            actions.push(btn('Rejected', 'times', 'Reject', 'btn-danger'));
        }
        if (b.status === 'Approved') {
            actions.push(btn('Completed', 'flag-checkered', 'Mark completed', 'btn-success'));
            actions.push(btn('Cancelled', 'ban', 'Cancel booking', 'btn-danger'));
        }
        if (['Rejected', 'Cancelled'].includes(b.status)) {
            actions.push(btn('Pending', 'undo', 'Restore to pending'));
        }
        actions.push(`<button type="button" class="btn btn-ghost btn-icon" data-delete-booking="${e(b.id)}" title="Delete" aria-label="Delete booking"><i class="fas fa-trash"></i></button>`);
        return `<div class="table-actions">${actions.join('')}</div>`;
    }

    function bookingRow(b) {
        const paid = b.paymentStatus === 'paid' ? 'paid' : 'demo — not charged';
        return `<tr>
            <td><strong>${e(b.userName || b.userEmail)}</strong><span class="cell-sub">${e(b.userEmail)}${b.phone ? ' · ' + e(b.phone) : ''}</span></td>
            <td>${e(b.studioName || '—')}<span class="cell-sub">${e(b.sessionType)}${b.engineer ? ' · engineer' : ''}${b.notes ? ' · <span title="' + e(b.notes) + '">notes</span>' : ''}</span></td>
            <td>${e(Store.formatDate(b.date))}</td>
            <td>${e(b.time)}–${e(endTime(b))}<span class="cell-sub">${b.hours}h</span></td>
            <td>${e(Store.formatMoney(b.amount))}<span class="cell-sub">${e(paid)} · ${e(b.ref)}</span></td>
            <td><span class="status-badge status-${e(b.status.toLowerCase())}">${e(b.status)}</span></td>
            <td>${bookingActions(b)}</td>
        </tr>`;
    }

    function filteredBookings() {
        const q = bookingFilters.search.trim().toLowerCase();
        return newestFirst(Store.getBookings()).filter(b => {
            if (bookingFilters.status && b.status !== bookingFilters.status) return false;
            if (!q) return true;
            return [b.userName, b.userEmail, b.ref, b.studioName, b.sessionType, b.phone]
                .some(v => String(v || '').toLowerCase().includes(q));
        });
    }

    function renderBookings() {
        const recent = newestFirst(Store.getBookings()).slice(0, 8);
        document.getElementById('recent-bookings-table').innerHTML = recent.length
            ? recent.map(bookingRow).join('')
            : emptyRow(7, 'No bookings yet');

        const all = filteredBookings();
        document.getElementById('all-bookings-table').innerHTML = all.length
            ? all.map(bookingRow).join('')
            : emptyRow(7, Store.getBookings().length ? 'No bookings match your filters' : 'No bookings yet');
    }

    // ===================== STUDIOS =====================
    function renderStudios() {
        const studios = Store.getStudios();
        document.getElementById('studios-table').innerHTML = studios.length
            ? studios.map(s => `<tr>
                <td><div class="cell-with-thumb"><img src="${e(s.imageUrl)}" alt="" class="table-thumb"><strong>${e(s.name)}</strong></div></td>
                <td class="cell-muted">${e(s.description)}</td>
                <td class="cell-muted">${e(s.location)}</td>
                <td>${e(Store.formatMoney(s.hourlyRate))}/hr</td>
                <td><div class="table-actions">
                    <button type="button" class="btn btn-ghost btn-icon" data-edit-studio="${e(s.id)}" aria-label="Edit ${e(s.name)}"><i class="fas fa-edit"></i></button>
                    <button type="button" class="btn btn-danger btn-icon" data-delete-studio="${e(s.id)}" aria-label="Delete ${e(s.name)}"><i class="fas fa-trash"></i></button>
                </div></td>
            </tr>`).join('')
            : emptyRow(5, 'No studios yet');
    }

    function openStudioForm(studio) {
        const form = document.getElementById('studio-form');
        form.reset();
        document.getElementById('studio-modal-title').textContent = studio ? 'Edit Studio' : 'Add Studio';
        document.getElementById('studio-id').value = studio ? studio.id : '';
        if (studio) {
            document.getElementById('studio-name').value = studio.name;
            document.getElementById('studio-location').value = studio.location;
            document.getElementById('studio-rate').value = studio.hourlyRate;
            document.getElementById('studio-image-url').value = studio.imageUrl;
            document.getElementById('studio-description').value = studio.description;
            document.getElementById('studio-long-description').value = studio.longDescription || '';
        }
        openModal('studio-form-modal');
    }

    // ===================== INSTRUMENTS =====================
    function renderInstruments() {
        const instruments = Store.getInstruments();
        document.getElementById('instruments-table').innerHTML = instruments.length
            ? instruments.map(i => `<tr>
                <td><div class="cell-with-thumb"><img src="${e(i.imageUrl)}" alt="" class="table-thumb"><strong>${e(i.name)}</strong></div></td>
                <td class="cell-muted">${e(i.description)}</td>
                <td><div class="table-actions">
                    <button type="button" class="btn btn-ghost btn-icon" data-edit-instrument="${e(i.id)}" aria-label="Edit ${e(i.name)}"><i class="fas fa-edit"></i></button>
                    <button type="button" class="btn btn-danger btn-icon" data-delete-instrument="${e(i.id)}" aria-label="Delete ${e(i.name)}"><i class="fas fa-trash"></i></button>
                </div></td>
            </tr>`).join('')
            : emptyRow(3, 'No instruments yet');
    }

    function openInstrumentForm(instr) {
        const form = document.getElementById('instrument-form');
        form.reset();
        document.getElementById('instrument-modal-title').textContent = instr ? 'Edit Instrument' : 'Add Instrument';
        document.getElementById('instrument-id').value = instr ? instr.id : '';
        if (instr) {
            document.getElementById('instrument-name').value = instr.name;
            document.getElementById('instrument-image-url').value = instr.imageUrl;
            document.getElementById('instrument-description').value = instr.description;
            document.getElementById('instrument-long-description').value = instr.longDescription || '';
            document.getElementById('instrument-fun-fact').value = instr.funFact || '';
            document.getElementById('instrument-joke').value = instr.joke || '';
        }
        openModal('instrument-form-modal');
    }

    // ===================== REVIEWS =====================
    function renderFeedback() {
        const sorted = [...Store.getFeedbacks()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        document.getElementById('feedback-table').innerHTML = sorted.length
            ? sorted.map(f => `<tr>
                    <td><strong>${e(f.name || f.userEmail || 'Unknown')}</strong><span class="cell-sub">${e(f.userEmail)}</span></td>
                    <td>${e(f.studioName || '—')}</td>
                    <td class="text-gold nowrap" aria-label="${f.rating} out of 5">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</td>
                    <td class="cell-message" title="${e(f.message)}">"${e(f.message)}"</td>
                    <td class="cell-muted nowrap">${e(Store.formatDate(f.date))}</td>
                    <td><div class="table-actions">
                        <button type="button" class="btn ${f.featured ? 'btn-primary' : 'btn-ghost'} btn-icon" data-feature="${e(f.id)}" title="${f.featured ? 'Remove from site' : 'Feature on site'}" aria-pressed="${f.featured}"><i class="fas fa-award"></i></button>
                        <button type="button" class="btn btn-danger btn-icon" data-delete-feedback="${e(f.id)}" aria-label="Delete review"><i class="fas fa-trash"></i></button>
                    </div></td>
                </tr>`).join('')
            : emptyRow(6, 'No reviews yet');
    }

    // ===================== USERS =====================
    function renderUsers() {
        const users = Store.getProfiles();
        const counts = {};
        Store.getBookings().forEach(b => { counts[b.userEmail] = (counts[b.userEmail] || 0) + 1; });
        document.getElementById('users-table').innerHTML = users.length
            ? users.map(u => `<tr>
                    <td><strong>${e(u.name || '—')}</strong></td>
                    <td class="cell-muted">${e(u.email)}</td>
                    <td><span class="status-badge ${u.isAdmin ? 'status-approved' : 'status-neutral'}">${u.isAdmin ? 'Admin' : 'Client'}</span></td>
                    <td>${counts[u.email] || 0}</td>
                    <td class="cell-muted">${u.createdAt ? e(Store.formatDate(String(u.createdAt).slice(0, 10))) : '—'}</td>
                </tr>`).join('')
            : emptyRow(5, 'No users yet');
    }

    // ===================== PAYMENT ISSUES =====================
    function renderPaymentIssues() {
        const issues = Store.getPaymentIssues();
        document.getElementById('payments-table').innerHTML = issues.length
            ? issues.map(i => `<tr>
                    <td><strong>${e(i.paymentRef)}</strong></td>
                    <td>${e(Store.formatMoney(i.amount))}</td>
                    <td class="cell-message" title="${e(i.reason)}">${e(i.reason)}</td>
                    <td class="cell-muted nowrap">${e(Store.formatDate(i.createdAt))}</td>
                    <td>${i.resolved
                        ? '<span class="status-badge status-approved">Resolved</span>'
                        : `<button type="button" class="btn btn-success btn-sm" data-resolve-issue="${e(i.id)}"><i class="fas fa-check"></i> Mark resolved</button>`}</td>
                </tr>`).join('')
            : emptyRow(5, 'No payment issues — every paid booking was saved.');
    }

    function renderAll() {
        updateStats();
        renderBookings();
        renderStudios();
        renderInstruments();
        renderFeedback();
        renderUsers();
        renderPaymentIssues();
    }

    // ===================== NAVIGATION =====================
    function showSection(id) {
        if (!SECTION_TITLES[id]) id = 'dashboard';
        document.querySelectorAll('.admin-section').forEach(s => s.classList.toggle('active', s.id === 'section-' + id));
        document.querySelectorAll('.admin-sidebar-nav a[data-section]').forEach(a => a.classList.toggle('active', a.dataset.section === id));
        setText('admin-page-title', SECTION_TITLES[id]);
        document.querySelector('.admin-main')?.scrollTo({ top: 0 });
    }

    async function refresh(button) {
        if (button) button.classList.add('spinning');
        const ok = await reloadData();
        if (button) button.classList.remove('spinning');
        if (ok) renderAll();
        return ok;
    }

    // ===================== EVENTS =====================
    document.addEventListener('click', (ev) => {
        const t = ev.target;
        const nav = t.closest('[data-section]');
        if (nav) {
            ev.preventDefault();
            history.replaceState(null, '', '#' + nav.dataset.section);
            showSection(nav.dataset.section);
            return;
        }

        const refreshBtn = t.closest('#refresh-btn');
        if (refreshBtn) {
            refresh(refreshBtn).then(ok => ok && showToast('Data refreshed', 'success'));
            return;
        }

        const statusBtn = t.closest('[data-booking-status]');
        if (statusBtn) {
            const status = statusBtn.dataset.bookingStatus;
            const b = Store.getBooking(statusBtn.dataset.id);
            if (!b) return;
            run(statusBtn, () => Store.updateBookingStatus(b.id, status), `Booking ${b.ref} → ${status}`);
            return;
        }

        const delBooking = t.closest('[data-delete-booking]');
        if (delBooking) {
            const b = Store.getBooking(delBooking.dataset.deleteBooking);
            if (b && confirm(`Permanently delete booking ${b.ref}?`)) {
                run(delBooking, () => Store.deleteBooking(b.id), 'Booking deleted');
            }
            return;
        }

        if (t.closest('#add-studio-btn')) { openStudioForm(null); return; }
        const editStudio = t.closest('[data-edit-studio]');
        if (editStudio) { openStudioForm(Store.getStudio(editStudio.dataset.editStudio)); return; }
        const delStudio = t.closest('[data-delete-studio]');
        if (delStudio) {
            const s = Store.getStudio(delStudio.dataset.deleteStudio);
            if (!s) return;
            const active = Store.getBookings().filter(b => b.studioId === s.id && Store.isUpcoming(b)).length;
            const warn = active ? `\n\n${active} upcoming booking(s) reference this studio and will stay in the bookings list.` : '';
            if (confirm(`Delete "${s.name}"?${warn}`)) {
                run(delStudio, () => Store.deleteStudio(s.id), 'Studio deleted');
            }
            return;
        }

        if (t.closest('#add-instrument-btn')) { openInstrumentForm(null); return; }
        const editInstr = t.closest('[data-edit-instrument]');
        if (editInstr) { openInstrumentForm(Store.getInstrument(editInstr.dataset.editInstrument)); return; }
        const delInstr = t.closest('[data-delete-instrument]');
        if (delInstr) {
            const i = Store.getInstrument(delInstr.dataset.deleteInstrument);
            if (i && confirm(`Delete "${i.name}"?`)) {
                run(delInstr, () => Store.deleteInstrument(i.id), 'Instrument deleted');
            }
            return;
        }

        const feature = t.closest('[data-feature]');
        if (feature) {
            run(feature, () => Store.toggleFeatured(feature.dataset.feature),
                res => (res.feedback.featured ? 'Review featured on the site' : 'Review removed from the site'));
            return;
        }
        const delFb = t.closest('[data-delete-feedback]');
        if (delFb) {
            if (confirm('Delete this review?')) run(delFb, () => Store.deleteFeedback(delFb.dataset.deleteFeedback), 'Review deleted');
            return;
        }

        const resolve = t.closest('[data-resolve-issue]');
        if (resolve) {
            run(resolve, () => Store.resolvePaymentIssue(Number(resolve.dataset.resolveIssue)), 'Marked as resolved');
            return;
        }

        if (t.closest('#export-csv-btn')) {
            const rows = filteredBookings();
            if (!rows.length) { showToast('No bookings to export', 'info'); return; }
            downloadFile(`bookings-${Store.localDateISO()}.csv`, Store.bookingsToCSV(rows), 'text/csv');
        }
    });

    document.addEventListener('input', (ev) => {
        if (ev.target.id === 'booking-search') {
            bookingFilters.search = ev.target.value;
            renderBookings();
        }
    });
    document.addEventListener('change', (ev) => {
        if (ev.target.id === 'booking-status-filter') {
            bookingFilters.status = ev.target.value;
            renderBookings();
        }
    });

    document.addEventListener('submit', async (ev) => {
        if (ev.target.id === 'studio-form') {
            ev.preventDefault();
            const res = await run(document.getElementById('save-studio-btn'), () => Store.saveStudio({
                id: document.getElementById('studio-id').value || undefined,
                name: document.getElementById('studio-name').value,
                location: document.getElementById('studio-location').value,
                hourlyRate: document.getElementById('studio-rate').value,
                imageUrl: document.getElementById('studio-image-url').value,
                description: document.getElementById('studio-description').value,
                longDescription: document.getElementById('studio-long-description').value
            }), r => `Studio "${r.studio.name}" saved`);
            if (res.ok) closeModal('studio-form-modal');
        } else if (ev.target.id === 'instrument-form') {
            ev.preventDefault();
            const res = await run(document.getElementById('save-instrument-btn'), () => Store.saveInstrument({
                id: document.getElementById('instrument-id').value || undefined,
                name: document.getElementById('instrument-name').value,
                imageUrl: document.getElementById('instrument-image-url').value,
                description: document.getElementById('instrument-description').value,
                longDescription: document.getElementById('instrument-long-description').value,
                funFact: document.getElementById('instrument-fun-fact').value,
                joke: document.getElementById('instrument-joke').value
            }), r => `Instrument "${r.instrument.name}" saved`);
            if (res.ok) closeModal('instrument-form-modal');
        }
    });

    // New bookings arrive from clients — refresh when the admin returns to the tab
    let lastRefresh = Date.now();
    window.addEventListener('focus', () => {
        if (Date.now() - lastRefresh < 15000) return;
        lastRefresh = Date.now();
        refresh();
    });

    // ===================== INIT =====================
    function updateClock() {
        setText('admin-datetime', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }));
    }

    window.appReady.then((user) => {
        if (!isBackendConfigured()) return;
        if (!user.loggedIn || !user.isAdmin) {
            window.location.replace(user.loggedIn ? 'user-dashboard.html' : 'index.html?login=1');
            return;
        }
        setText('admin-avatar', (user.name || 'A')[0].toUpperCase());
        updateClock();
        setInterval(updateClock, 60000);
        showSection(location.hash.slice(1) || 'dashboard');
        renderAll();
    });
})();
