// Component loader utility
class ComponentLoader {
    static async loadComponent(elementId, componentPath) {
        try {
            const response = await fetch(componentPath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const html = await response.text();
            const element = document.getElementById(elementId);
            if (element) {
                element.innerHTML = html;
                return true;
            }
            return false;
        } catch (error) {
            console.error(`Error loading component ${componentPath}:`, error);
            // Fallback to inline content if component fails to load
            return false;
        }
    }

    static async loadAllComponents() {
        const components = [
            { id: 'header-placeholder', path: 'header.html' },
            { id: 'footer-placeholder', path: 'footer.html' }
        ];

        try {
            const loadPromises = components.map(component => 
                this.loadComponent(component.id, component.path)
            );

            await Promise.all(loadPromises);
            
            console.log('All components loaded successfully');
            
            // Reinitialize scripts after components are loaded
            if (window.initializeApp) {
                setTimeout(() => {
                    window.initializeApp();
                }, 100);
            }
        } catch (error) {
            console.error('Error loading components:', error);
        }
    }
}

// Alternative method for loading components using fetch
class ComponentManager {
    constructor() {
        this.loadedComponents = new Set();
    }

    async loadComponent(placeholder, componentFile) {
        if (this.loadedComponents.has(componentFile)) {
            return true;
        }

        try {
            const element = document.getElementById(placeholder);
            if (!element) {
                console.warn(`Placeholder element ${placeholder} not found`);
                return false;
            }

            const response = await fetch(componentFile);
            if (!response.ok) {
                throw new Error(`Failed to load ${componentFile}: ${response.status}`);
            }

            const html = await response.text();
            element.innerHTML = html;
            this.loadedComponents.add(componentFile);
            
            console.log(`Component ${componentFile} loaded successfully`);
            return true;
        } catch (error) {
            console.error(`Error loading component ${componentFile}:`, error);
            return false;
        }
    }

    async initialize() {
        const componentConfig = [
            { placeholder: 'header-placeholder', file: 'header.html' },
            { placeholder: 'footer-placeholder', file: 'footer.html' }
        ];

        const promises = componentConfig.map(config => 
            this.loadComponent(config.placeholder, config.file)
        );

        const results = await Promise.allSettled(promises);
        const successful = results.filter(result => result.status === 'fulfilled' && result.value).length;
        
        console.log(`${successful}/${componentConfig.length} components loaded successfully`);
        
        // Initialize app functionality after component loading
        this.initializeAfterLoad();
    }

    initializeAfterLoad() {
        // Small delay to ensure DOM is fully updated
        setTimeout(() => {
            if (typeof window.initializeApp === 'function') {
                window.initializeApp();
            }
        }, 50);
    }
}

// Initialize component manager
const componentManager = new ComponentManager();

// Initialize components when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded - Initializing components');
    
    // Try to load components
    if (window.location.protocol === 'file:') {
        console.warn('Loading components via file:// protocol may not work. Consider using a local server.');
        // Initialize app directly if using file protocol
        if (typeof window.initializeApp === 'function') {
            window.initializeApp();
        }
    } else {
        // Load components via HTTP/HTTPS
        componentManager.initialize();
    }
});

// Fallback initialization for file protocol or component loading failures
window.addEventListener('load', function() {
    // If components haven't loaded after 1 second, initialize anyway
    setTimeout(() => {
        if (!componentManager.loadedComponents.size && typeof window.initializeApp === 'function') {
            console.log('Initializing app with fallback content');
            window.initializeApp();
        }
    }, 1000);
});

// Export for global access
window.ComponentLoader = ComponentLoader;
window.ComponentManager = componentManager;