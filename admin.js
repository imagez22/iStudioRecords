/* =============================================================
   I Studio Records — Admin Panel JS
   Works with the new static admin.html sections
   ============================================================= */

let adminData = {
    studios: [], instruments: [], bookings: [], feedbacks: [], users: []
};

// ===================== DATA LOADING =====================
async function loadAdminData() {
    try {
        const res = await fetch('db.json?t=' + Date.now());
        const db  = await res.json();
        adminData.studios     = db.studios     || [];
        adminData.instruments = db.instruments || [];
        adminData.feedbacks   = db.feedbacks   || [];
        adminData.users       = db.users       || [];

        // Merge localStorage bookings
        const local = JSON.parse(localStorage.getItem('appData') || '{}');
        adminData.bookings = [
            ...(db.bookings   || []),
            ...(local.bookings || [])
        ];
        // Merge local feedbacks
        if (local.feedbacks?.length) {
            adminData.feedbacks = [...adminData.feedbacks, ...local.feedbacks];
        }

        renderAllSections();
    } catch(err) {
        console.error('Admin data load error:', err);
        if (typeof showToast === 'function') showToast('Failed to load data', 'error');
    }
}

// ===================== STATS =====================
function updateStats() {
    const pending = adminData.bookings.filter(b => b.status === 'Pending').length;
    setEl('stat-total-bookings', adminData.bookings.length);
    setEl('stat-pending',        pending);
    setEl('stat-studios',        adminData.studios.length);
    setEl('stat-reviews',        adminData.feedbacks.length);
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ===================== RENDER SECTIONS =====================
function renderAllSections() {
    updateStats();
    renderBookingsTable('recent-bookings-table', adminData.bookings.slice(0, 8));
    renderBookingsTable('all-bookings-table', adminData.bookings, true);
    renderStudiosTable();
    renderInstrumentsTable();
    renderFeedbackTable();
}

function renderBookingsTable(tableId, bookings, showEmail = false) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    if (!bookings.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--color-text-muted);">No bookings yet</td></tr>`;
        return;
    }
    tbody.innerHTML = bookings.map(b => {
        const user = adminData.users.find(u => u.email === b.userEmail);
        const name = user?.name || b.userName || b.userEmail || 'Unknown';
        const statusClass = (b.status || 'pending').toLowerCase();
        return `<tr>
            <td>${name}</td>
            ${showEmail ? `<td style="font-size:0.8rem;color:var(--color-text-secondary);">${b.userEmail || ''}</td>` : ''}
            <td>${b.studioName || '—'}</td>
            <td>${b.date || b.bookingDate || '—'}</td>
            <td>${b.time || b.bookingTime || '—'}</td>
            <td><span class="status-badge status-${statusClass}">${b.status || 'Pending'}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost" style="padding:5px 10px;font-size:0.75rem;" onclick="updateBookingStatus('${b.id}','Approved')">✓</button>
                    <button class="btn btn-ghost" style="padding:5px 10px;font-size:0.75rem;" onclick="updateBookingStatus('${b.id}','Rejected')" title="Reject">✕</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function renderStudiosTable() {
    const tbody = document.getElementById('studios-table');
    if (!tbody) return;
    if (!adminData.studios.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--color-text-muted);">No studios yet</td></tr>`;
        return;
    }
    tbody.innerHTML = adminData.studios.map(s => `
        <tr>
            <td><strong>${s.name}</strong></td>
            <td style="color:var(--color-text-secondary);font-size:0.85rem;">${s.description}</td>
            <td style="color:var(--color-text-secondary);font-size:0.85rem;">${s.location}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost" style="padding:6px 12px;font-size:0.8rem;" onclick="editStudio('${s.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger" style="padding:6px 12px;font-size:0.8rem;" onclick="deleteStudio('${s.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderInstrumentsTable() {
    const tbody = document.getElementById('instruments-table');
    if (!tbody) return;
    if (!adminData.instruments.length) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--color-text-muted);">No instruments yet</td></tr>`;
        return;
    }
    tbody.innerHTML = adminData.instruments.map(i => `
        <tr>
            <td><strong>${i.name}</strong></td>
            <td style="color:var(--color-text-secondary);font-size:0.85rem;">${i.description}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost" style="padding:6px 12px;font-size:0.8rem;" onclick="editInstrument(${i.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger" style="padding:6px 12px;font-size:0.8rem;" onclick="deleteInstrument(${i.id})"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderFeedbackTable() {
    const tbody = document.getElementById('feedback-table');
    if (!tbody) return;
    if (!adminData.feedbacks.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--color-text-muted);">No reviews yet</td></tr>`;
        return;
    }
    const sorted = [...adminData.feedbacks].sort((a, b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = sorted.map(f => {
        const user = adminData.users.find(u => u.email === f.userEmail);
        const name = user?.name || f.name || f.userEmail || 'Unknown';
        const stars = '★'.repeat(f.rating || 5) + '☆'.repeat(5 - (f.rating || 5));
        return `<tr>
            <td><strong>${name}</strong><br><span style="font-size:0.75rem;color:var(--color-text-muted);">${f.userEmail || ''}</span></td>
            <td>${f.studioName || '—'}</td>
            <td style="color:var(--color-primary);letter-spacing:2px;">${stars}</td>
            <td style="font-size:0.8rem;color:var(--color-text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">"${f.message || ''}"</td>
            <td style="font-size:0.8rem;color:var(--color-text-muted);">${f.date || ''}</td>
        </tr>`;
    }).join('');
}

// ===================== BOOKING ACTIONS =====================
function updateBookingStatus(bookingId, newStatus) {
    const booking = adminData.bookings.find(b => String(b.id) === String(bookingId));
    if (booking) {
        booking.status = newStatus;
        const local = JSON.parse(localStorage.getItem('appData') || '{"bookings":[]}');
        const idx = local.bookings?.findIndex(b => String(b.id) === String(bookingId));
        if (idx !== undefined && idx >= 0) {
            local.bookings[idx].status = newStatus;
            localStorage.setItem('appData', JSON.stringify(local));
        }
        renderAllSections();
        if (typeof showToast === 'function') showToast(`Booking ${newStatus.toLowerCase()}`, 'success');
    }
}
window.updateBookingStatus = updateBookingStatus;

// ===================== STUDIO CRUD =====================
function editStudio(id) {
    const studio = adminData.studios.find(s => s.id === id);
    if (!studio) return;
    document.getElementById('studio-modal-title').textContent = 'Edit Studio';
    document.getElementById('studio-id').value           = studio.id;
    document.getElementById('studio-name').value         = studio.name;
    document.getElementById('studio-location').value     = studio.location;
    document.getElementById('studio-image-url').value    = studio.imageUrl;
    document.getElementById('studio-description').value  = studio.description;
    document.getElementById('studio-long-description').value = studio.longDescription || '';
    document.getElementById('studio-form-modal').style.display = 'flex';
}
window.editStudio = editStudio;

function deleteStudio(id) {
    if (!confirm('Delete this studio?')) return;
    adminData.studios = adminData.studios.filter(s => s.id !== id);
    renderStudiosTable();
    updateStats();
    if (typeof showToast === 'function') showToast('Studio deleted', 'success');
}
window.deleteStudio = deleteStudio;

// ===================== INSTRUMENT CRUD =====================
function editInstrument(id) {
    const instr = adminData.instruments.find(i => i.id === id);
    if (!instr) return;
    document.getElementById('instrument-modal-title').textContent = 'Edit Instrument';
    document.getElementById('instrument-id').value               = instr.id;
    document.getElementById('instrument-name').value             = instr.name;
    document.getElementById('instrument-image-url').value        = instr.imageUrl;
    document.getElementById('instrument-description').value      = instr.description;
    document.getElementById('instrument-long-description').value = instr.longDescription || '';
    document.getElementById('instrument-fun-fact').value         = instr.funFact || '';
    document.getElementById('instrument-joke').value             = instr.joke || '';
    document.getElementById('instrument-form-modal').style.display = 'flex';
}
window.editInstrument = editInstrument;

function deleteInstrument(id) {
    if (!confirm('Delete this instrument?')) return;
    adminData.instruments = adminData.instruments.filter(i => i.id !== id);
    renderInstrumentsTable();
    updateStats();
    if (typeof showToast === 'function') showToast('Instrument deleted', 'success');
}
window.deleteInstrument = deleteInstrument;

// ===================== FORM SUBMISSIONS =====================
document.addEventListener('DOMContentLoaded', () => {
    loadAdminData();

    // Studio form
    const studioForm = document.getElementById('studio-form');
    if (studioForm) {
        studioForm.addEventListener('submit', e => {
            e.preventDefault();
            const id = document.getElementById('studio-id').value;
            const studioObj = {
                id: id || 'studio-' + Date.now(),
                name: document.getElementById('studio-name').value,
                location: document.getElementById('studio-location').value,
                imageUrl: document.getElementById('studio-image-url').value,
                description: document.getElementById('studio-description').value,
                longDescription: document.getElementById('studio-long-description').value,
                unavailableSlots: {}
            };
            if (id) {
                const idx = adminData.studios.findIndex(s => s.id === id);
                if (idx >= 0) adminData.studios[idx] = studioObj;
            } else {
                adminData.studios.push(studioObj);
            }
            renderStudiosTable();
            updateStats();
            document.getElementById('studio-form-modal').style.display = 'none';
            studioForm.reset();
            if (typeof showToast === 'function') showToast('Studio saved!', 'success');
        });
    }

    // Instrument form
    const instrForm = document.getElementById('instrument-form');
    if (instrForm) {
        instrForm.addEventListener('submit', e => {
            e.preventDefault();
            const id = document.getElementById('instrument-id').value;
            const instrObj = {
                id: id ? parseInt(id) : Date.now(),
                name: document.getElementById('instrument-name').value,
                imageUrl: document.getElementById('instrument-image-url').value,
                description: document.getElementById('instrument-description').value,
                longDescription: document.getElementById('instrument-long-description').value,
                funFact: document.getElementById('instrument-fun-fact').value,
                joke: document.getElementById('instrument-joke').value
            };
            if (id) {
                const idx = adminData.instruments.findIndex(i => String(i.id) === String(id));
                if (idx >= 0) adminData.instruments[idx] = instrObj;
            } else {
                adminData.instruments.push(instrObj);
            }
            renderInstrumentsTable();
            updateStats();
            document.getElementById('instrument-form-modal').style.display = 'none';
            instrForm.reset();
            if (typeof showToast === 'function') showToast('Instrument saved!', 'success');
        });
    }

    // Admin theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) document.documentElement.setAttribute('data-color-scheme', savedTheme);
    else document.documentElement.setAttribute('data-color-scheme', 'dark');
});
