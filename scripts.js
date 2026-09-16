// Global variable to hold our fetched data
let appData = {
    studios: [],
    instruments: [],
    reviews: [],
    users: [],
    bookings: [],
    feedbacks: []
};

// Carousel configuration object
const carousels = {
    studios: { currentIndex: 0, itemsPerView: 3, totalItems: 0 },
    instruments: { currentIndex: 0, itemsPerView: 3, totalItems: 0 },
    reviews: { currentIndex: 0, itemsPerView: 3, totalItems: 0 }
};

// Load user from localStorage on app start
function loadUserFromStorage() {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        try {
            window.user = JSON.parse(storedUser);
            if (window.updateHeaderUI) window.updateHeaderUI();
        } catch (e) {
            console.error('Failed to parse stored user:', e);
        }
    }
}

// --- DATA FETCHING AND RENDERING ---

async function loadData() {
    try {
        const response = await fetch('db.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        appData = data;
        
        // Initialize users from db.json (first-time setup)
        if (typeof initializeUsersFromDB === 'function') {
            initializeUsersFromDB(data.users || []);
        }
        
        // Merge with localStorage data if it exists
        const storedAppData = localStorage.getItem('appData');
        if (storedAppData) {
            try {
                const stored = JSON.parse(storedAppData);
                appData.bookings = stored.bookings || appData.bookings;
                appData.feedbacks = stored.feedbacks || appData.feedbacks;
            } catch (e) {
                console.error('Failed to merge stored app data:', e);
            }
        }

        renderStudios(appData.studios);
        renderInstruments(appData.instruments);
        renderReviews(appData.reviews);
        
        carousels.studios.totalItems = appData.studios.length;
        carousels.instruments.totalItems = appData.instruments.length;
        carousels.reviews.totalItems = appData.reviews.length;

    } catch (error) {
        console.error("Could not load data:", error);
    }
}

function renderStudios(studiosData) {
    const track = document.getElementById('studios-track');
    if (!track) return;
    
    track.innerHTML = studiosData.map(studio => `
        <div class="carousel-slide">
            <div class="studio-card">
                <div class="studio-image">
                    <img src="${studio.imageUrl}" alt="${studio.name}">
                </div>
                <div class="studio-content">
                    <h3>${studio.name}</h3>
                    <p>${studio.description}</p>
                    <a href="#" class="btn studio-btn" data-studio-id="${studio.id}">Read More</a>
                </div>
            </div>
        </div>
    `).join('');
}

function renderInstruments(instrumentsData) {
    const track = document.getElementById('instruments-track');
    if (!track) return;
    
    track.innerHTML = instrumentsData.map(instrument => `
        <div class="carousel-slide">
            <div class="instrument-card">
                <div class="instrument-image">
                    <img src="${instrument.imageUrl}" alt="${instrument.name}">
                </div>
                <div class="instrument-content">
                    <h3>${instrument.name}</h3>
                    <p>${instrument.description}</p>
                    <a href="#" class="btn studio-btn" data-instrument-id="${instrument.id}">Read more</a>
                </div>
            </div>
        </div>
    `).join('');
}

function renderReviews(reviewsData) {
    const track = document.getElementById('reviews-track');
    if (!track) return;
    const generateStars = (count) => '★'.repeat(count) + '☆'.repeat(5 - count);
    track.innerHTML = reviewsData.map(review => `
        <div class="review-card interactive">
            <img class="reviewer-photo" src="${review.avatarUrl}" alt="${review.name}">
            <div class="reviewer-name">${review.name}</div>
            <div class="stars">${generateStars(review.stars)}</div>
            <p class="review-text">"${review.text}"</p>
        </div>
    `).join('');
}

function addStudioModalListeners() {
    const studioTrack = document.getElementById('studios-track');
    if (!studioTrack) return;

    studioTrack.addEventListener('click', function(event) {
        const readMoreButton = event.target.closest('[data-studio-id]');
        if (!readMoreButton) return;

        event.preventDefault();
        const studioId = readMoreButton.dataset.studioId;
        const studioData = appData.studios.find(s => s.id === studioId);

        if (studioData && typeof showStudioDetails === 'function') {
            showStudioDetails(studioData);
        }
    });
}

function addInstrumentModalListeners() {
    const instrumentTrack = document.getElementById('instruments-track');
    if (!instrumentTrack) return;

    instrumentTrack.addEventListener('click', function(event) {
        const readMoreButton = event.target.closest('[data-instrument-id]');
        if (!readMoreButton) return;

        event.preventDefault();
        const instrumentId = parseInt(readMoreButton.dataset.instrumentId, 10);
        const instrumentData = appData.instruments.find(instr => instr.id === instrumentId);

        if (instrumentData && typeof showInstrumentDetails === 'function') {
            showInstrumentDetails(instrumentData);
        }
    });
}


function moveCarousel(carouselType, direction) {
    const carousel = carousels[carouselType];
    const track = document.getElementById(`${carouselType}-track`);
    if (!track) return;
    
    // Calculate slide width dynamically including gap
    const firstSlide = track.querySelector('.carousel-slide, .review-card');
    if (!firstSlide) return;
    const slideStyle = window.getComputedStyle(firstSlide);
    const slideWidth = firstSlide.offsetWidth + parseInt(slideStyle.marginRight) * 2; // A more robust way might be needed if using gap

    carousel.currentIndex += direction;
    const maxIndex = Math.max(0, carousel.totalItems - carousel.itemsPerView);
    
    if (carousel.currentIndex < 0) carousel.currentIndex = 0;
    if (carousel.currentIndex > maxIndex) carousel.currentIndex = maxIndex;
    
    // Fixed value: carousel slide 280px + gap 24px = 304px per item
    const translateX = -carousel.currentIndex * 304;
    track.style.transform = `translateX(${translateX}px)`;
}

function updateCarouselView() {
    const width = window.innerWidth;
    let itemsPerView = 1;
    if (width >= 1024) {
        itemsPerView = 3;
    } else if (width >= 768) {
        itemsPerView = 2;
    }
    
    carousels.studios.itemsPerView = itemsPerView;
    carousels.instruments.itemsPerView = itemsPerView;
    carousels.reviews.itemsPerView = itemsPerView;
    
    moveCarousel('studios', -carousels.studios.currentIndex);
    moveCarousel('instruments', -carousels.instruments.currentIndex);
    moveCarousel('reviews', -carousels.reviews.currentIndex);
}

function toggleFAQ(element) {
    const faqItem = element.closest('.faq-item');
    const isActive = faqItem.classList.contains('active');
    document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
    });
    if (!isActive) {
        faqItem.classList.add('active');
    }
}

function initSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
             const href = this.getAttribute('href');
            if (href === '#') {
                e.preventDefault();
                return;
            }
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

function initHeaderScroll() {
    const header = document.querySelector('.header');
    if (!header) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    // Also observe dynamically added cards
    const tracks = document.querySelectorAll('.carousel-track, .services-grid');
    tracks.forEach(container => {
        const mutationObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        observer.observe(node);
                    }
                });
            });
        });
        mutationObserver.observe(container, { childList: true });
    });
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function initThemeSwitcher() {
    const sunIcon = '<i class="fas fa-sun"></i>';
    const moonIcon = '<i class="fas fa-moon"></i>';
    const toggleButtons = [document.getElementById('theme-toggle'), document.getElementById('theme-toggle-user')];

    const setTheme = (theme) => {
        document.documentElement.setAttribute('data-color-scheme', theme);
        localStorage.setItem('theme', theme);
        toggleButtons.forEach(btn => {
            if (btn) {
                btn.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
            }
        });
    };

    toggleButtons.forEach(btn => {
        if(btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const currentTheme = document.documentElement.getAttribute('data-color-scheme') || 'light';
                setTheme(currentTheme === 'dark' ? 'light' : 'dark');
            });
        }
    });
    
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
}


// --- APP INITIALIZATION ---
async function initializeApp() {
    console.log('I Studio Records app initializing...');
    
    // Load current user from storage first
    loadUserFromStorage();
    
    await loadData();
    
    updateCarouselView();
    initSmoothScrolling();
    initHeaderScroll();
    initScrollAnimations();
    initThemeSwitcher();
    
    addStudioModalListeners();
    addInstrumentModalListeners();
    
    window.addEventListener('resize', debounce(updateCarouselView, 250));
    console.log('JSN Music Studios app initialized successfully');
}

// Make functions globally available for components.js and inline HTML
window.initializeApp = initializeApp;
window.moveCarousel = moveCarousel;
window.toggleFAQ = toggleFAQ;

// ============================================================
// TOAST UTILITY
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
    t.innerHTML = `<i class="fas fa-${icons[type] || 'music'}"></i> ${msg}`;
    container.appendChild(t);
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, 3500);
}
window.showToast = showToast;

// ============================================================
// PAYSTACK BOOKING FLOW
// ============================================================
let bookingState = {
    studioId: null,
    studioName: '',
    studioImage: '',
    studioLocation: '',
    date: '',
    time: '',
    step: 1
};

window.bookingState = bookingState;

function openBookingModal(studioData) {
    if (!studioData) return;
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!user) {
        document.getElementById('authModal').style.display = 'flex';
        showToast('Please sign in to book a studio', 'info');
        return;
    }

    bookingState.studioId   = studioData.id;
    bookingState.studioName = studioData.name;
    bookingState.studioImage = studioData.imageUrl || '';
    bookingState.studioLocation = studioData.location || '';
    bookingState.step = 1;

    // Pre-fill user info
    const nameEl  = document.getElementById('booking-name');
    const emailEl = document.getElementById('booking-email');
    if (nameEl  && user.name)  nameEl.value  = user.name;
    if (emailEl && user.email) emailEl.value = user.email;

    // Populate header
    const img = document.getElementById('adv-booking-img');
    if (img && studioData.imageUrl) { img.src = studioData.imageUrl; img.style.display = 'block'; }
    document.getElementById('adv-booking-title').textContent    = studioData.name;
    document.getElementById('adv-booking-location').textContent = studioData.location || '';

    // Set min date to today
    const dateInput = document.getElementById('adv-booking-date');
    if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];

    bookingNextStep(1);
    document.getElementById('advancedBookingModal').style.display = 'flex';
}
window.openBookingModal = openBookingModal;

function bookingNextStep(step) {
    // Validate step 2
    if (step === 3) {
        const name  = document.getElementById('booking-name')?.value.trim();
        const email = document.getElementById('booking-email')?.value.trim();
        if (!name || !email) { showToast('Please fill in your name and email', 'error'); return; }
        if (!bookingState.date || !bookingState.time) { showToast('Please select a date and time first', 'error'); return; }
        // Populate payment summary
        document.getElementById('pay-studio-name').textContent = bookingState.studioName;
        document.getElementById('pay-date').textContent        = bookingState.date;
        document.getElementById('pay-time').textContent        = bookingState.time;
    }
    if (step === 2 && (!bookingState.date || !bookingState.time)) {
        showToast('Please select a date and time slot first', 'error');
        return;
    }

    bookingState.step = step;
    document.querySelectorAll('.booking-step').forEach(s => s.classList.remove('active'));
    const stepEl = document.getElementById('booking-step-' + step);
    if (stepEl) stepEl.classList.add('active');

    // Update progress bar
    for (let i = 1; i <= 3; i++) {
        const prog = document.getElementById('prog-' + i);
        if (!prog) continue;
        prog.className = 'progress-step';
        if (i < step) prog.classList.add('done');
        else if (i === step) prog.classList.add('active');
    }
}
window.bookingNextStep = bookingNextStep;

// Date change triggers time slot loading
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'adv-booking-date') {
        bookingState.date = e.target.value;
        bookingState.time = '';
        const btn = document.getElementById('step1-next');
        if (btn) btn.disabled = true;
        loadTimeSlotsForDate(e.target.value);
    }
});

function loadTimeSlotsForDate(date) {
    const container = document.getElementById('time-slots-container');
    if (!container) return;
    const studio = appData.studios.find(s => s.id === bookingState.studioId);
    const unavailable = studio?.unavailableSlots?.[date] || [];
    const slots = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];

    container.innerHTML = slots.map(slot => {
        const isUnavailable = unavailable.includes(slot);
        return `<button 
            class="time-slot-btn ${isUnavailable ? '' : ''}" 
            ${isUnavailable ? 'disabled title="Already booked"' : ''}
            onclick="selectTimeSlot('${slot}', this)">
            ${slot}
        </button>`;
    }).join('');
}

function selectTimeSlot(time, btn) {
    document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    bookingState.time = time;
    const nextBtn = document.getElementById('step1-next');
    if (nextBtn) nextBtn.disabled = false;
}
window.selectTimeSlot = selectTimeSlot;

function initiatePaystackPayment() {
    const email = document.getElementById('booking-email')?.value.trim();
    const name  = document.getElementById('booking-name')?.value.trim();
    if (!email) { showToast('Email required for payment', 'error'); return; }

    const amount = 1500000; // ₦15,000 in kobo

    // Check if Paystack script is loaded
    if (typeof PaystackPop === 'undefined') {
        // Paystack not loaded — simulate in demo mode
        showToast('Demo mode: Payment simulated successfully! ✓', 'success');
        completeBooking(name, email, 'DEMO-' + Date.now());
        return;
    }

    const handler = PaystackPop.setup({
        key: window.PAYSTACK_PUBLIC_KEY,
        email: email,
        amount: amount,
        currency: 'NGN',
        ref: 'ISR-' + Date.now(),
        metadata: {
            custom_fields: [
                { display_name: 'Studio', value: bookingState.studioName },
                { display_name: 'Date', value: bookingState.date },
                { display_name: 'Time', value: bookingState.time },
                { display_name: 'Client Name', value: name }
            ]
        },
        callback: function(response) {
            showToast('Payment successful! Booking confirmed. ✓', 'success');
            completeBooking(name, email, response.reference);
        },
        onClose: function() {
            showToast('Payment cancelled', 'info');
        }
    });
    handler.openIframe();
}
window.initiatePaystackPayment = initiatePaystackPayment;

function completeBooking(clientName, clientEmail, reference) {
    const booking = {
        id: 'BK-' + Date.now(),
        userId: clientEmail,
        userEmail: clientEmail,
        studioId: bookingState.studioId,
        studioName: bookingState.studioName,
        date: bookingState.date,
        time: bookingState.time,
        status: 'Pending',
        requestedDate: new Date().toISOString().split('T')[0],
        paymentRef: reference,
        notes: document.getElementById('booking-notes')?.value || ''
    };

    // Save to localStorage
    const stored = JSON.parse(localStorage.getItem('appData') || '{"bookings":[],"feedbacks":[]}');
    stored.bookings = [...(stored.bookings || []), booking];
    localStorage.setItem('appData', JSON.stringify(stored));

    // Close modal
    const modal = document.getElementById('advancedBookingModal');
    if (modal) modal.style.display = 'none';

    showToast(`Booking confirmed for ${bookingState.studioName} on ${bookingState.date}!`, 'success');
}
window.completeBooking = completeBooking;