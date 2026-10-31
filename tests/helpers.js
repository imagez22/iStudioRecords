// Minimal in-memory localStorage for running browser modules under Node.
class MemoryStorage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
    setItem(key, value) { this.data.set(key, String(value)); }
    removeItem(key) { this.data.delete(key); }
    clear() { this.data.clear(); }
}

function installStorage() {
    global.localStorage = new MemoryStorage();
    return global.localStorage;
}

module.exports = { MemoryStorage, installStorage };
