/* =============================================================
   I Studio Records — Auth, detail and review modals
   Used on index.html and user-dashboard.html.
   Depends on: auth.js, store.js, scripts.js
   ============================================================= */

let currentStudioForBooking = null;

function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
        button.dataset.label = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${label || 'Please wait…'}`;
    } else {
        button.disabled = false;
        if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
}

// --- AUTH MODAL ---
function showAuthPanel(panel) {
    ['loginForm', 'signupForm', 'confirmPanel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = id === panel ? 'block' : 'none';
    });
    const li = document.getElementById('login-image');
    const si = document.getElementById('signup-image');
    if (li) li.style.display = panel === 'signupForm' ? 'none' : 'block';
    if (si) si.style.display = panel === 'signupForm' ? 'block' : 'none';
}
const showLogin = () => showAuthPanel('loginForm');
const showSignup = () => showAuthPanel('signupForm');

function openAuthModal(mode = 'login') {
    if (!document.getElementById('authModal')) {
        window.location.href = 'index.html?login=1';
        return;
    }
    ['login-error', 'signup-error', 'login-info'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
    if (mode === 'signup') showSignup(); else showLogin();
    openModal('authModal');
}
window.openAuthModal = openAuthModal;

/** After login/signup: resume a pending booking, otherwise go to the dashboard. */
async function onAuthenticated(session) {
    window.user = session;
    updateHeaderUI();
    closeModal('authModal');

    const pending = sessionStorage.getItem('pendingBooking');
    if (pending && document.getElementById('advancedBookingModal')) {
        sessionStorage.removeItem('pendingBooking');
        showToast(`Welcome, ${session.name}! Let's finish your booking.`, 'success');
        await reloadData();
        requestBooking(pending);
        return;
    }
    window.location.href = session.isAdmin ? 'admin.html' : 'user-dashboard.html';
}

async function handleLoginSubmit(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pwd = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    errorEl.textContent = '';

    setBusy(btn, true, 'Signing in…');
    const result = await signIn(email, pwd);
    setBusy(btn, false);
    if (result.ok) {
        document.getElementById('login-form').reset();
        onAuthenticated(result.user);
    } else {
        errorEl.textContent = result.error;
    }
}
window.handleLoginSubmit = handleLoginSubmit;

async function handleSignupSubmit(event) {
    if (event) event.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const pwd = document.getElementById('signup-password').value;
    const cpw = document.getElementById('signup-confirm').value;
    const errorEl = document.getElementById('signup-error');
    const btn = document.getElementById('signup-btn');
    errorEl.textContent = '';

    if (pwd !== cpw) {
        errorEl.textContent = 'Passwords do not match.';
        return;
    }
    setBusy(btn, true, 'Creating account…');
    const result = await signUp(name, email, pwd);
    setBusy(btn, false);
    if (!result.ok) {
        errorEl.textContent = result.error;
        return;
    }
    document.getElementById('signup-form').reset();
    if (result.needsConfirmation) {
        document.getElementById('confirm-email').textContent = email.toLowerCase();
        showAuthPanel('confirmPanel');
        return;
    }
    onAuthenticated(result.user);
}
window.handleSignupSubmit = handleSignupSubmit;

async function handleForgotPassword(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const errorEl = document.getElementById('login-error');
    const infoEl = document.getElementById('login-info');
    errorEl.textContent = '';
    infoEl.textContent = '';
    const result = await requestPasswordReset(email);
    if (result.ok) infoEl.textContent = `If ${email} has an account, a reset link is on its way.`;
    else errorEl.textContent = result.error;
}

// Opened when the user arrives from a password-reset email
function openResetPasswordModal() {
    if (!document.getElementById('resetPasswordModal')) return;
    document.getElementById('reset-password-form').reset();
    document.getElementById('reset-error').textContent = '';
    openModal('resetPasswordModal');
}
window.openResetPasswordModal = openResetPasswordModal;

async function handleResetPassword(event) {
    if (event) event.preventDefault();
    const pwd = document.getElementById('reset-password').value;
    const cpw = document.getElementById('reset-confirm').value;
    const errorEl = document.getElementById('reset-error');
    if (pwd !== cpw) {
        errorEl.textContent = 'Passwords do not match.';
        return;
    }
    const result = await updatePassword(pwd);
    if (!result.ok) {
        errorEl.textContent = result.error;
        return;
    }
    closeModal('resetPasswordModal');
    showToast('Password updated — you are signed in.', 'success');
    await reloadData();
}

// --- DETAIL MODALS ---
function showStudioDetails(studio) {
    if (!studio) return;
    currentStudioForBooking = studio;
    const img = document.getElementById('modal-studio-image');
    img.src = studio.imageUrl;
    img.alt = studio.name;
    document.getElementById('modal-studio-title').textContent = studio.name;
    document.getElementById('modal-studio-location').textContent = studio.location;
    document.getElementById('modal-studio-long-description').textContent = studio.longDescription || studio.description;
    document.getElementById('modal-studio-rate').textContent = `${Store.formatMoney(studio.hourlyRate)} / hour`;
    openModal('studioModal');
}
window.showStudioDetails = showStudioDetails;

function showInstrumentDetails(instrument) {
    if (!instrument) return;
    const img = document.getElementById('modal-instr-image');
    img.src = instrument.imageUrl;
    img.alt = instrument.name;
    document.getElementById('modal-instr-title').textContent = instrument.name;
    document.getElementById('modal-instr-long-description').textContent = instrument.longDescription || instrument.description || '';
    document.getElementById('modal-instr-joke').textContent = instrument.joke || '';
    document.getElementById('modal-instr-fun-fact').textContent = instrument.funFact || '';
    document.getElementById('modal-instr-fun-fact').closest('p').style.display = instrument.funFact ? '' : 'none';
    openModal('instrumentModal');
}
window.showInstrumentDetails = showInstrumentDetails;

// --- REVIEW (FEEDBACK) MODAL ---
function openFeedbackModal(studioId) {
    const u = refreshUser();
    if (!u.loggedIn) {
        openAuthModal('login');
        showToast('Please sign in to leave a review', 'info');
        return;
    }
    const form = document.getElementById('feedback-form');
    if (!form) return;
    form.reset();
    document.getElementById('feedback-error').textContent = '';
    document.getElementById('feedback-name').value = u.name || '';
    document.getElementById('feedback-email').value = u.email || '';

    const select = document.getElementById('feedback-studio-select');
    select.innerHTML = Store.getStudios()
        .map(s => `<option value="${Store.escapeHTML(s.id)}">${Store.escapeHTML(s.name)}</option>`)
        .join('');
    if (studioId) select.value = studioId;
    openModal('feedbackModal');
}
window.openFeedbackModal = openFeedbackModal;

async function handleFeedbackSubmit(event) {
    if (event) event.preventDefault();
    const errorEl = document.getElementById('feedback-error');
    const btn = document.getElementById('submit-feedback-btn');
    const rating = document.querySelector('#feedback-form input[name="rating"]:checked');
    errorEl.textContent = '';

    setBusy(btn, true, 'Sending…');
    const result = await Store.addFeedback({
        name: document.getElementById('feedback-name').value.trim(),
        studioId: document.getElementById('feedback-studio-select').value,
        rating: rating ? rating.value : 0,
        message: document.getElementById('feedback-message').value
    });
    setBusy(btn, false);
    if (!result.ok) {
        errorEl.textContent = result.error;
        return;
    }
    closeModal('feedbackModal');
    showToast('Thank you for your review!', 'success');
    document.dispatchEvent(new CustomEvent('data:changed'));
}
window.handleFeedbackSubmit = handleFeedbackSubmit;

// --- DELEGATED CLICKS ---
document.addEventListener('click', function (event) {
    const target = event.target;

    if (target.closest('#login-signup-btn')) {
        event.preventDefault();
        openAuthModal('login');
        return;
    }
    if (target.closest('#showSignup')) { event.preventDefault(); showSignup(); return; }
    if (target.closest('#showLogin, #confirm-back-btn')) { event.preventDefault(); showLogin(); return; }
    if (target.closest('#forgot-password-link')) { handleForgotPassword(event); return; }

    if (target.closest('#modal-studio-book-btn')) {
        event.preventDefault();
        closeModal('studioModal');
        if (currentStudioForBooking) requestBooking(currentStudioForBooking.id);
        return;
    }
    if (target.closest('#modal-studio-feedback-btn')) {
        event.preventDefault();
        closeModal('studioModal');
        openFeedbackModal(currentStudioForBooking && currentStudioForBooking.id);
        return;
    }
    const reviewBtn = target.closest('[data-action="leave-review"]');
    if (reviewBtn) {
        event.preventDefault();
        openFeedbackModal(reviewBtn.dataset.studioId);
    }
});

document.addEventListener('submit', function (event) {
    switch (event.target.id) {
        case 'login-form': handleLoginSubmit(event); break;
        case 'signup-form': handleSignupSubmit(event); break;
        case 'feedback-form': handleFeedbackSubmit(event); break;
        case 'reset-password-form': handleResetPassword(event); break;
    }
});
