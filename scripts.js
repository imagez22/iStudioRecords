// Global variable to hold our fetched data
let appData = {
    studios: [],
    instruments: [],
    reviews: []
};

// Carousel configuration object
const carousels = {
    studios: { currentIndex: 0, itemsPerView: 3, totalItems: 0 },
    instruments: { currentIndex: 0, itemsPerView: 3, totalItems: 0 },
    reviews: { currentIndex: 0, itemsPerView: 3, totalItems: 0 }
};

// --- DATA FETCHING AND RENDERING ---

async function loadData() {
    try {
        const response = await fetch('db.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        appData = data;

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
    
    const translateX = -carousel.currentIndex * 320; // Using a fixed value for simplicity with gap
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
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    
    // We observe the parent tracks to apply animations to dynamically loaded cards
    const tracks = document.querySelectorAll('.carousel-track, .services-grid');
    tracks.forEach(container => {
        const observerConfig = { childList: true };
        const mutationObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // It's an element
                        node.style.opacity = '0';
                        node.style.transform = 'translateY(20px)';
                        node.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                        observer.observe(node);
                    }
                });
            });
        });
        mutationObserver.observe(container, observerConfig);
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
    console.log('JSN Music Studios app initializing...');
    
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