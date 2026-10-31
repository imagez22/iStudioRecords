// Component loader: injects header.html / footer.html, then starts the app once.

const ComponentManager = {
    loadedComponents: new Set(),

    async loadComponent(placeholderId, file) {
        const element = document.getElementById(placeholderId);
        if (!element) return false;
        try {
            const response = await fetch(file, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Failed to load ${file}: ${response.status}`);
            element.outerHTML = await response.text();
            this.loadedComponents.add(file);
            return true;
        } catch (error) {
            console.error(`Error loading component ${file}:`, error);
            return false;
        }
    },

    async initialize() {
        await Promise.allSettled([
            this.loadComponent('header-placeholder', 'header.html'),
            this.loadComponent('footer-placeholder', 'footer.html')
        ]);
        const year = document.getElementById('footer-year');
        if (year) year.textContent = new Date().getFullYear();
        if (typeof window.initializeApp === 'function') window.initializeApp();
    }
};

function startComponents() {
    if (window.location.protocol === 'file:') {
        console.warn('Components cannot be loaded over file:// — run a local server (npm start).');
        if (typeof window.initializeApp === 'function') window.initializeApp();
        return;
    }
    ComponentManager.initialize();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startComponents);
} else {
    startComponents();
}

window.ComponentManager = ComponentManager;
