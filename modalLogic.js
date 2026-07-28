// --- Global State ---
let user = { loggedIn: false, isAdmin: false, name: null, email: null };
let currentStudioForBooking = null; // To keep track of which studio is being booked

// --- UI UPDATE FUNCTION ---
function updateHeaderUI() {
    const guestMenu = document.getElementById('guest-menu');
    const userMenu = document.getElementById('user-menu');
    const userGreeting = document.getElementById('user-greeting');
    if (!guestMenu || !userMenu || !userGreeting) return;

    if (user.loggedIn) {
        guestMenu.style.display = 'none';
        userMenu.style.display = 'flex';
    } else {
        guestMenu.style.display = 'flex';
        userMenu.style.display = 'none';
    }
}

// --- MODAL DISPLAY FUNCTIONS ---
function openModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex'; 
}
function closeModal(element) { 
    const modal = element.closest('.modal');
    if (modal) modal.style.display = 'none'; 
}

// --- SPECIFIC MODAL CONTENT FUNCTIONS ---
function renderMyRequests(userBookings) {
    const listEl = document.getElementById('requests-list');
    if (!listEl) return;
    if (userBookings.length === 0) {
        listEl.innerHTML = '<p>You have no booking requests.</p>';
        return;
    }
    listEl.innerHTML = userBookings.map(booking => {
        const statusClass = `status-${booking.status.toLowerCase()}`;
        return `
            <div class="request-item">
                <h4>${booking.studioName}</h4>
                <p><strong>Booking Date:</strong> ${booking.bookingDate} | <strong>Time:</strong> ${booking.bookingTime}</p>
                <p><strong>Status:</strong> <span class="status-badge ${statusClass}">${booking.status}</span></p>
            </div>
        `;
    }).join('');
}

function renderMyFeedbacks(userFeedbacks) {
    const listEl = document.getElementById('feedbacks-list');
    if (!listEl) return;
    const generateStars = (count) => '★'.repeat(count) + '☆'.repeat(5 - count);
    if (userFeedbacks.length === 0) {
        listEl.innerHTML = '<p>You have not submitted any feedback.</p>';
        return;
    }
    listEl.innerHTML = userFeedbacks.map(feedback => `
        <div class="feedback-item">
            <h4>${feedback.studioName}</h4>
            <div class="feedback-item-meta">
                <span>${feedback.date}</span> | <span>${generateStars(feedback.rating)}</span>
            </div>
            <p class="feedback-item-message">"${feedback.message}"</p>
        </div>
    `).join('');
}

function showStudioDetails(studio) {
    if (!studio) return;
    currentStudioForBooking = studio; // Store the current studio
    document.getElementById('modal-studio-image').src = studio.imageUrl;
    document.getElementById('modal-studio-image').alt = studio.name;
    document.getElementById('modal-studio-title').textContent = studio.name;
    document.getElementById('modal-studio-location').textContent = studio.location;
    document.getElementById('modal-studio-long-description').textContent = studio.longDescription;
    openModal('studioModal');
}

function showInstrumentDetails(instrument) {
    if (!instrument) return;
    document.getElementById('modal-instr-image').src = instrument.imageUrl;
    document.getElementById('modal-instr-image').alt = instrument.name;
    document.getElementById('modal-instr-title').textContent = instrument.name;
    document.getElementById('modal-instr-long-description').textContent = instrument.longDescription;
    document.getElementById('modal-instr-joke').textContent = instrument.joke;
    document.getElementById('modal-instr-fun-fact').textContent = instrument.funFact;
    openModal('instrumentModal');
}

function showLogin(){
    document.getElementById('loginForm').style.display='block';
    document.getElementById('signupForm').style.display='none';
    document.getElementById('login-image').style.display = 'block';
    document.getElementById('signup-image').style.display = 'none';
}
function showSignup(){
    document.getElementById('loginForm').style.display='none';
    document.getElementById('signupForm').style.display='block';
    document.getElementById('login-image').style.display = 'none';
    document.getElementById('signup-image').style.display = 'block';
}

function renderTimeSlots(selectedDate, studio) {
    const timeSlotsContainer = document.getElementById('time-slots-container');
    const allSlots = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
    const unavailableSlots = studio.unavailableSlots[selectedDate] || [];
    timeSlotsContainer.innerHTML = allSlots.map(slot => {
        const isUnavailable = unavailableSlots.includes(slot);
        return `<button class="time-slot-btn" data-time="${slot}" ${isUnavailable ? 'disabled' : ''}>${slot}</button>`;
    }).join('');
    timeSlotsContainer.querySelectorAll('.time-slot-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            timeSlotsContainer.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
}

function openAdvancedBookingModal(studio) {
    if (!studio) return;
    document.getElementById('adv-booking-title').textContent = `Book: ${studio.name}`;
    document.getElementById('adv-booking-location').textContent = studio.location;
    const dateInput = document.getElementById('adv-booking-date');
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
    dateInput.value = today;
    renderTimeSlots(today, studio);
    dateInput.addEventListener('input', () => {
        renderTimeSlots(dateInput.value, studio);
    });
    openModal('advancedBookingModal');
}

function openFeedbackModal(studio) {
    if (!studio) return;
    
    // Pre-fill user and studio info
    document.getElementById('feedback-name').value = user.name;
    document.getElementById('feedback-email').value = user.email;
    
    // Populate and select the correct studio in the dropdown
    const studioSelect = document.getElementById('feedback-studio-select');
    studioSelect.innerHTML = appData.studios.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    studioSelect.value = studio.name;

    openModal('feedbackModal');
}


// --- MASTER CLICK HANDLER (EVENT DELEGATION) ---
document.addEventListener('click', function(event) {
    const target = event.target;

    // --- Main Login/Signup Button ---
    if (target.closest('#login-signup-btn')) {
        event.preventDefault();
        openModal('authModal');
        showLogin();
    }
    
    // --- Hero Banner "Book a Studio" Button ---
    if (target.closest('#hero-book-btn')) {
        event.preventDefault();
        if (!user.loggedIn) {
            openModal('authModal');
            showLogin();
        } else {
            // This can be changed later to open a general booking modal
            // For now, let's just alert or scroll to studios
            document.getElementById('studios').scrollIntoView();
        }
    }

    // --- Studio Modal "Book Now" Button -> Opens Advanced Booking ---
    if (target.closest('#modal-studio-book-btn')) {
        event.preventDefault();
        if (user.loggedIn && !user.isAdmin) {
            closeModal(target);
            openAdvancedBookingModal(currentStudioForBooking);
        } else {
            alert("Please log in to book a studio.");
            closeModal(target);
            openModal('authModal');
            showLogin();
        }
    }

    // --- Final Booking Confirmation ---
    if (target.closest('#confirm-advanced-booking')) {
        const selectedDate = document.getElementById('adv-booking-date').value;
        const selectedTimeBtn = document.querySelector('.time-slot-btn.selected');
        if (!selectedDate || !selectedTimeBtn) {
            alert("Please select a date and time slot.");
            return;
        }
        const selectedTime = selectedTimeBtn.dataset.time;
        const newBooking = {
            id: Date.now(),
            userEmail: user.email,
            studioName: currentStudioForBooking.name,
            requestDate: new Date().toISOString().split('T')[0],
            bookingDate: selectedDate,
            bookingTime: selectedTime,
            status: "Pending"
        };
        appData.bookings.push(newBooking);

        // Close the current modal
        closeModal(target);
        alert(`Booking request for ${newBooking.studioName} has been submitted!`);

        // Now, open the "My Requests" modal to show the updated list
        const userBookings = appData.bookings.filter(b => b.userEmail === user.email);
        renderMyRequests(userBookings);
        openModal('myRequestsModal');
    }

    // --- Modal Close Buttons ---
    if (target.closest('.modal-close')) {
        closeModal(target);
    }

    // --- Auth Form Switching ---
    if (target.closest('#showSignup')) { event.preventDefault(); showSignup(); }
    if (target.closest('#showLogin')) { event.preventDefault(); showLogin(); }

    // --- Form Submissions (Login & Signup) ---
    // LOGIN BUTTON LOGICV
if (target.closest('#login-btn')) {
    const email = document.getElementById('login-email').value;
    const pwd = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    let loggedInUser = null;

    if (email === 'user@example.com' && pwd === 'password123') {
        loggedInUser = { loggedIn: true, isAdmin: false, name: 'Gem', email };
    } else if (email === 'admin@example.com' && pwd === 'admin123') {
        loggedInUser = { loggedIn: true, isAdmin: true, name: 'Admin', email };
    }

    if (loggedInUser) {
        localStorage.setItem('currentUser', JSON.stringify(loggedInUser)); // Save user to localStorage
        closeModal(target);
        if (loggedInUser.isAdmin) {
            window.location.href = 'admin.html'; // Redirect admin to dashboard
        } else {
            updateHeaderUI(); // Update header for regular user
        }
    } else {
        errorEl.textContent = 'Invalid credentials.';
    }
}

// logout button logic 
if (target.closest('#logout-btn')) {
    event.preventDefault();
    localStorage.removeItem('currentUser'); // Remove user from localStorage
    user = { loggedIn: false, isAdmin: false, name: null, email: null };
    updateHeaderUI();
    alert('You have been logged out.');
}

    if (target.closest('#signup-btn')) {
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const pwd = document.getElementById('signup-password').value;
        const cpw = document.getElementById('signup-confirm').value;
        const errorEl = document.getElementById('signup-error');
        if (!name || !email || !pwd || !cpw || !email.includes('@') || pwd.length < 6 || pwd !== cpw) {
            errorEl.textContent = 'Please check your details. Passwords must match and be 6+ characters.';
            return;
        }
        errorEl.textContent = '';
        user = { loggedIn: true, isAdmin: false, name: name, email: email };
        alert('Signup successful! You are now logged in.');
        closeModal(target);
        updateHeaderUI();
    }
    
    
    if (target.closest('#my-requests-btn')) {
        event.preventDefault();
        const userBookings = appData.bookings ? appData.bookings.filter(b => b.userEmail === user.email) : [];
        renderMyRequests(userBookings);
        openModal('myRequestsModal');
    }
    if (target.closest('#my-feedbacks-btn')) {
        event.preventDefault();
        const userFeedbacks = appData.feedbacks ? appData.feedbacks.filter(f => f.userEmail === user.email) : [];
        renderMyFeedbacks(userFeedbacks);
        openModal('myFeedbacksModal');
    }

    // Handle "Submit Feedback" button in Studio Modal ---
    if (target.closest('#modal-studio-feedback-btn')) {
        event.preventDefault();
        if (user.loggedIn) {
            closeModal(target); // Close the studio details modal
            openFeedbackModal(currentStudioForBooking); // Open the feedback form
        } else {
            alert("Please log in to submit feedback.");
            closeModal(target);
            openModal('authModal');
            showLogin();
        }
    }

    // Handle final submission from the Feedback Form ---
    if (target.closest('#submit-feedback-btn')) {
        const ratingInput = document.querySelector('.star-rating input[name="rating"]:checked');
        const messageInput = document.getElementById('feedback-message');

        // Validation
        if (!ratingInput || !messageInput.value) {
            alert("Please provide a rating and a message for your feedback.");
            return;
        }

        const newFeedback = {
            id: Date.now(),
            userEmail: user.email,
            studioName: currentStudioForBooking.name,
            date: new Date().toISOString().split('T')[0],
            rating: parseInt(ratingInput.value),
            message: messageInput.value
        };

        // Add to our mock database
        appData.feedbacks.push(newFeedback);

        alert("Thank you for your feedback!");
        closeModal(target);
        
        // As you requested, let's open the "My Feedbacks" modal so you can see your new entry!
        const userFeedbacks = appData.feedbacks.filter(f => f.userEmail === user.email);
        renderMyFeedbacks(userFeedbacks);
        openModal('myFeedbacksModal');
    }
});

// Run on initial page load to set the correct header state
window.addEventListener('load', updateHeaderUI);