document.addEventListener('DOMContentLoaded', () => {
    // --- Security Check ---
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || !currentUser.isAdmin) {
        alert("You do not have permission to view this page.");
        window.location.href = 'index.html';
        return;
    }

    // --- Global variable for our data ---
    let appData = {};

    // --- Get Stable Parent Elements ---
    const mainContent = document.querySelector('.main-content');

    // --- RENDER FUNCTIONS (These build the HTML for each view) ---

    function renderDashboard() {
        mainContent.innerHTML = `
            <header class="main-header">
                <div><h1>Hello ${currentUser.name}!</h1><p>Welcome to JSN Music Studios.</p></div>
                <div class="header-actions">
                    <a href="#" class="btn" id="admin-logout-btn">Logout</a>
                    <a href="#" class="btn btn-theme-toggle" id="admin-theme-toggle" aria-label="Toggle theme"><i class="fas fa-sun"></i></a>
                </div>
            </header>
            <section class="stats-section">
                <h2>Dashboard</h2>
                <p class="section-subtitle">View your stats here!</p>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-icon" style="background-color: #3b82f6;"><i class="fas fa-door-open"></i></div><div class="stat-info"><p>Studios</p><span id="stats-studios">0</span></div></div>
                    <div class="stat-card"><div class="stat-icon" style="background-color: #ef4444;"><i class="fas fa-music"></i></div><div class="stat-info"><p>Instruments</p><span id="stats-instruments">0</span></div></div>
                    <div class="stat-card"><div class="stat-icon" style="background-color: #8b5cf6;"><i class="fas fa-comment-dots"></i></div><div class="stat-info"><p>Feedbacks</p><span id="stats-feedbacks">0</span></div></div>
                    <div class="stat-card"><div class="stat-icon" style="background-color: #f97316;"><i class="fas fa-clipboard-list"></i></div><div class="stat-info"><p>Requests</p><span id="stats-requests">0</span></div></div>
                </div>
            </section>
        `;
        document.getElementById('stats-studios').textContent = appData.studios?.length || 0;
        document.getElementById('stats-instruments').textContent = appData.instruments?.length || 0;
        document.getElementById('stats-feedbacks').textContent = appData.feedbacks?.length || 0;
        document.getElementById('stats-requests').textContent = appData.bookings?.length || 0;
    }

    function updateBookingStatus(bookingId, newStatus) {
        const bookingIndex = appData.bookings.findIndex(b => b.id == bookingId);
        if (bookingIndex !== -1) {
            appData.bookings[bookingIndex].status = newStatus;
            localStorage.setItem('appData', JSON.stringify(appData));
            renderRequestsManagementPage(); // Re-render the page to show the change
        }
    }

    function renderStudiosManagementPage() {
        const studiosHTML = appData.studios.map(studio => `
            <tr data-id="${studio.id}">
                <td>${studio.name}</td>
                <td>${studio.location}</td>
                <td>${studio.description}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-modify">Modify</button>
                    <button class="btn btn-sm btn-delete">Delete</button>
                </td>
            </tr>
        `).join('');
        mainContent.innerHTML = `
            <header class="main-header">
                <h1>Manage Studios</h1><p>Here to aid your studio management</p>
                <div class="header-actions"><button class="btn" id="add-studio-btn">+ Add Studio</button></div>
            </header>
            <section class="management-table">
                <table>
                    <thead><tr><th>Studio Name</th><th>Location</th><th>Description</th><th>Action</th></tr></thead>
                    <tbody id="studios-table-body">${studiosHTML}</tbody>
                </table>
            </section>
        `;
    }

    function renderInstrumentsManagementPage() {
        const instrumentsHTML = appData.instruments.map(instrument => `
            <tr data-id="${instrument.id}">
                <td>${instrument.name}</td>
                <td>${instrument.description}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-modify">Modify</button>
                    <button class="btn btn-sm btn-delete">Delete</button>
                </td>
            </tr>
        `).join('');
        mainContent.innerHTML = `
            <header class="main-header">
                <h1>Manage Instruments</h1><p>Manage your instrument inventory</p>
                <div class="header-actions"><button class="btn" id="add-instrument-btn">+ Add Instrument</button></div>
            </header>
            <section class="management-table">
                <table>
                    <thead><tr><th>Instrument Name</th><th>Description</th><th>Action</th></tr></thead>
                    <tbody id="instruments-table-body">${instrumentsHTML}</tbody>
                </table>
            </section>
        `;
    }

    function renderRequestsManagementPage() {
        const requestsHTML = appData.bookings.map(booking => {
            const user = appData.users.find(u => u.email === booking.userEmail);
            const userName = user ? user.name : 'Unknown';

            return `
                <tr data-id="${booking.id}">
                    <td>${userName}</td>
                    <td>${booking.userEmail}</td>
                    <td>${booking.studioName}</td>
                    <td>${booking.bookingDate} at ${booking.bookingTime}</td>
                    <td><span class="status-badge status-${booking.status.toLowerCase()}">${booking.status}</span></td>
                    <td class="action-buttons">
                        <button class="btn btn-sm btn-approve" title="Approve"><i class="fas fa-check"></i></button>
                        <button class="btn btn-sm btn-pending" title="Set to Pending"><i class="fas fa-pause"></i></button>
                        <button class="btn btn-sm btn-reject" title="Reject"><i class="fas fa-times"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

        mainContent.innerHTML = `
            <header class="main-header">
                <h1>Booking Requests</h1>
                <p>Grant studio rental requests effectively over a call/mail</p>
            </header>
            <section class="management-table">
                <table>
                    <thead>
                        <tr>
                            <th>User Name</th>
                            <th>Email</th>
                            <th>Studio Name</th>
                            <th>Booking Date</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>${requestsHTML}</tbody>
                </table>
            </section>
        `;
    }

     function renderFeedbacksManagementPage(feedbacksToRender = appData.feedbacks) {
        // Sort by date descending (newest first)
        const sortedFeedbacks = [...feedbacksToRender].sort((a, b) => new Date(b.date) - new Date(a.date));

        const feedbacksHTML = sortedFeedbacks.map(feedback => {
            const user = appData.users.find(u => u.email === feedback.userEmail);
            const userName = user ? user.name : 'Unknown';
            const stars = '★'.repeat(feedback.rating) + '☆'.repeat(5 - feedback.rating);

            return `
                <tr data-id="${feedback.id}">
                    <td>${userName}</td>
                    <td>${feedback.studioName}</td>
                    <td><span class="star-rating-display">${stars}</span></td>
                    <td>${feedback.date}</td>
                    <td class="feedback-message-preview">${feedback.message.substring(0, 50)}...</td>
                    <td class="action-buttons">
                        <button class="btn btn-sm btn-view-feedback" data-message="${feedback.message}" title="View Full Message"><i class="fas fa-eye"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

        mainContent.innerHTML = `
            <header class="main-header">
                <h1>Client Feedback</h1>
                <p>Monitor customer satisfaction and review messages.</p>
                <div class="header-actions">
                    <div class="filter-controls">
                        <label for="feedback-filter">Filter by Date:</label>
                        <select id="feedback-filter" class="form-control" style="width: auto;">
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="last7">Last 7 Days</option>
                            <option value="last30">Last 30 Days</option>
                            <option value="thisMonth">This Month</option>
                        </select>
                    </div>
                </div>
            </header>
            <section class="management-table">
                <table>
                    <thead>
                        <tr>
                            <th>User Name</th>
                            <th>Studio</th>
                            <th>Rating</th>
                            <th>Date</th>
                            <th>Message Preview</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>${feedbacksHTML}</tbody>
                </table>
            </section>
        `;
    }

    function filterFeedbacks(filterValue) {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);
        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const filtered = appData.feedbacks.filter(feedback => {
            const feedbackDate = new Date(feedback.date);
            
            switch (filterValue) {
                case 'all':
                    return true;
                case 'today':
                    return feedbackDate.toDateString() === today.toDateString();
                case 'last7':
                    return feedbackDate >= sevenDaysAgo;
                case 'last30':
                    return feedbackDate >= thirtyDaysAgo;
                case 'thisMonth':
                    return feedbackDate >= thisMonthStart;
                default:
                    return true;
            }
        });

        renderFeedbacksManagementPage(filtered);
    }

    // --- MODAL FORM FUNCTIONS ---
    function openStudioFormModal(studio = null) {
        const modal = document.getElementById('studio-form-modal');
        const form = document.getElementById('studio-form');
        form.reset();
        if (studio) { // MODIFY MODE
            document.getElementById('studio-modal-title').textContent = 'Modify Studio';
            document.getElementById('studio-id').value = studio.id;
            document.getElementById('studio-name').value = studio.name;
            document.getElementById('studio-location').value = studio.location;
            document.getElementById('studio-image-url').value = studio.imageUrl;
            document.getElementById('studio-description').value = studio.description;
            document.getElementById('studio-long-description').value = studio.longDescription;
        } else { // ADD MODE
            document.getElementById('studio-modal-title').textContent = 'Add New Studio';
            document.getElementById('studio-id').value = '';
        }
        modal.style.display = 'flex';
    }

    function openInstrumentFormModal(instrument = null) {
        const modal = document.getElementById('instrument-form-modal');
        const form = document.getElementById('instrument-form');
        form.reset();
        if (instrument) { // MODIFY MODE
            document.getElementById('instrument-modal-title').textContent = 'Modify Instrument';
            document.getElementById('instrument-id').value = instrument.id;
            document.getElementById('instrument-name').value = instrument.name;
            document.getElementById('instrument-image-url').value = instrument.imageUrl;
            document.getElementById('instrument-description').value = instrument.description;
            document.getElementById('instrument-long-description').value = instrument.longDescription;
            document.getElementById('instrument-joke').value = instrument.joke;
            document.getElementById('instrument-fun-fact').value = instrument.funFact;
        } else { // ADD MODE
            document.getElementById('instrument-modal-title').textContent = 'Add New Instrument';
            document.getElementById('instrument-id').value = '';
        }
        modal.style.display = 'flex';
    }



    // --- MASTER CLICK HANDLER for the whole dashboard ---
    document.addEventListener('click', (e) => {
        // --- Sidebar Navigation ---
        if (e.target.closest('.sidebar-nav a')) {
            e.preventDefault();
            document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
            const clickedLink = e.target.closest('.sidebar-nav a');
            clickedLink.classList.add('active');
            const page = clickedLink.textContent.trim();
            if (page === 'Dashboard') renderDashboard();
            else if (page === 'Studios') renderStudiosManagementPage();
            else if (page === 'Instruments') renderInstrumentsManagementPage();
            else if (page === 'Requests') renderRequestsManagementPage();
            else if (page === 'Feedback') renderFeedbacksManagementPage(); 
            else if (page === 'Logout') {
                localStorage.removeItem('currentUser');
                window.location.href = 'index.html';
            }
        }

        // --- Header Buttons ---
        if (e.target.closest('#admin-logout-btn')) {
            e.preventDefault();
            localStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        }
        if (e.target.closest('#admin-theme-toggle')) {
            e.preventDefault();
            const sunIcon = '<i class="fas fa-sun"></i>', moonIcon = '<i class="fas fa-moon"></i>';
            const currentTheme = document.documentElement.getAttribute('data-color-scheme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-color-scheme', newTheme);
            localStorage.setItem('adminTheme', newTheme);
            e.target.closest('#admin-theme-toggle').innerHTML = newTheme === 'dark' ? sunIcon : moonIcon;
        }

        // --- Studio Management Clicks ---
        if (e.target.closest('#add-studio-btn')) { e.preventDefault(); openStudioFormModal(); }
        if (e.target.closest('#studios-table-body .btn-modify')) {
            const studioId = e.target.closest('tr').dataset.id;
            const studioToModify = appData.studios.find(s => s.id === studioId);
            openStudioFormModal(studioToModify);
        }
        if (e.target.closest('#studios-table-body .btn-delete')) {
            const studioId = e.target.closest('tr').dataset.id;
            if (confirm('Are you sure you want to delete this studio?')) {
                appData.studios = appData.studios.filter(s => s.id !== studioId);
                localStorage.setItem('appData', JSON.stringify(appData));
                renderStudiosManagementPage();
            }
        }
        
        // --- Instrument Management Clicks ---
        if (e.target.closest('#add-instrument-btn')) { e.preventDefault(); openInstrumentFormModal(); }
        if (e.target.closest('#instruments-table-body .btn-modify')) {
            const instrumentId = e.target.closest('tr').dataset.id;
            const instrumentToModify = appData.instruments.find(i => i.id == instrumentId);
            openInstrumentFormModal(instrumentToModify);
        }
        if (e.target.closest('#instruments-table-body .btn-delete')) {
            const instrumentId = e.target.closest('tr').dataset.id;
            if (confirm('Are you sure you want to delete this instrument?')) {
                appData.instruments = appData.instruments.filter(i => i.id != instrumentId);
                localStorage.setItem('appData', JSON.stringify(appData));
                renderInstrumentsManagementPage();
            }
        }
        
        // --- Modal Form Buttons ---
        if (e.target.closest('.btn-cancel')) { e.preventDefault(); e.target.closest('.modal').style.display = 'none'; }
        
        if (e.target.closest('#save-studio-btn')) {
            e.preventDefault();
            const studioId = document.getElementById('studio-id').value;
            const studioData = { name: document.getElementById('studio-name').value, location: document.getElementById('studio-location').value, imageUrl: document.getElementById('studio-image-url').value, description: document.getElementById('studio-description').value, longDescription: document.getElementById('studio-long-description').value };
            if (studioId) { // MODIFY mode
                const studioIndex = appData.studios.findIndex(s => s.id === studioId);
                appData.studios[studioIndex] = { ...appData.studios[studioIndex], ...studioData };
            } else { // ADD mode
                const newStudio = { id: `studio-${Date.now()}`, ...studioData, unavailableSlots: {} };
                appData.studios.push(newStudio);
            }
            localStorage.setItem('appData', JSON.stringify(appData));
            document.getElementById('studio-form-modal').style.display = 'none';
            renderStudiosManagementPage();
        }

        if (e.target.closest('#save-instrument-btn')) {
            e.preventDefault();
            const instrumentId = document.getElementById('instrument-id').value;
            const instrumentData = { name: document.getElementById('instrument-name').value, imageUrl: document.getElementById('instrument-image-url').value, description: document.getElementById('instrument-description').value, longDescription: document.getElementById('instrument-long-description').value, joke: document.getElementById('instrument-joke').value, funFact: document.getElementById('instrument-fun-fact').value };
            if (instrumentId) { // MODIFY mode
                const instrumentIndex = appData.instruments.findIndex(i => i.id == instrumentId);
                appData.instruments[instrumentIndex] = { ...appData.instruments[instrumentIndex], ...instrumentData };
            } else { // ADD mode
                const newInstrument = { id: Date.now(), ...instrumentData };
                appData.instruments.push(newInstrument);
            }
            localStorage.setItem('appData', JSON.stringify(appData));
            document.getElementById('instrument-form-modal').style.display = 'none';
            renderInstrumentsManagementPage();
        }

        // --- Booking Request Status Clicks ---
        if (e.target.closest('.btn-approve')) {
            const bookingId = e.target.closest('tr').dataset.id;
            updateBookingStatus(bookingId, 'Approved');
        }
        if (e.target.closest('.btn-pending')) {
            const bookingId = e.target.closest('tr').dataset.id;
            updateBookingStatus(bookingId, 'Pending');
        }
        if (e.target.closest('.btn-reject')) {
            const bookingId = e.target.closest('tr').dataset.id;
            updateBookingStatus(bookingId, 'Rejected');
        }

        // --- Filter Feedback Dropdown Change ---
        if (e.target.matches('#feedback-filter')) {
            filterFeedbacks(e.target.value);
        }
        
        // --- View Feedback Button (For future modal or simple alert) ---
        if (e.target.closest('.btn-view-feedback')) {
            const message = e.target.closest('.btn-view-feedback').dataset.message;
            alert(`Full Feedback Message:\n\n${message}`);
        }
    });

    // --- INITIALIZATION ---
    async function initializeAdminPage() {
        try {
            const savedData = localStorage.getItem('appData');
            if (savedData) {
                appData = JSON.parse(savedData);
            } else {
                const response = await fetch('db.json');
                if (!response.ok) throw new Error('Failed to fetch data');
                appData = await response.json();
                localStorage.setItem('appData', JSON.stringify(appData));
            }
            renderDashboard();
            const themeToggleBtn = document.getElementById('admin-theme-toggle');
            if (themeToggleBtn) {
                const sunIcon = '<i class="fas fa-sun"></i>', moonIcon = '<i class="fas fa-moon"></i>';
                const savedTheme = localStorage.getItem('adminTheme') || 'dark';
                document.documentElement.setAttribute('data-color-scheme', savedTheme);
                themeToggleBtn.innerHTML = savedTheme === 'dark' ? sunIcon : moonIcon;
            }
        } catch (error) {
            console.error("Error loading initial data:", error);
            mainContent.innerHTML = `<p style="color:red;">Error loading dashboard data.</p>`;
        }
    }
    initializeAdminPage();
});