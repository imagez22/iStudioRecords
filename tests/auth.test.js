const { installStorage } = require('./helpers');
const auth = require('../auth');

beforeEach(() => {
    installStorage();
});

describe('validateSignup', () => {
    test('accepts valid input', () => {
        expect(auth.validateSignup('Kofi Mensah', 'kofi@example.com', 'password123')).toBeNull();
    });

    test('rejects invalid input', () => {
        expect(auth.validateSignup('', 'a@b.com', 'password1')).toBe('All fields are required.');
        expect(auth.validateSignup('Test', 'notanemail', 'password1')).toMatch(/valid email/);
        expect(auth.validateSignup('Test', 'a@b', 'password1')).toMatch(/valid email/);
        expect(auth.validateSignup('Test', 'a@b.com', 'short')).toMatch(/at least 8/);
        expect(auth.validateSignup('x'.repeat(61), 'a@b.com', 'password1')).toMatch(/60 characters/);
    });
});

describe('friendlyAuthError', () => {
    test.each([
        ['Invalid login credentials', 'Invalid email or password.'],
        ['Email not confirmed', 'Please confirm your email first — check your inbox for the link.'],
        ['User already registered', 'Email already registered. Please sign in or use a different email.'],
        ['Email rate limit exceeded', 'Too many attempts. Please wait a minute and try again.'],
        ['TypeError: Failed to fetch', 'Network error — please check your connection.']
    ])('%s', (input, expected) => {
        expect(auth.friendlyAuthError({ message: input })).toBe(expected);
    });

    test('passes other messages through', () => {
        expect(auth.friendlyAuthError({ message: 'Signups not allowed for this instance' })).toBe('Signups not allowed for this instance');
    });
});

describe('without a configured backend', () => {
    test('reports not configured and refuses to sign in', async () => {
        expect(auth.isBackendConfigured()).toBe(false);
        expect(await auth.signIn('a@b.com', 'password1')).toEqual({ ok: false, error: 'The booking system is not connected yet.' });
        expect((await auth.signUp('A', 'a@b.com', 'password1')).ok).toBe(false);
        expect((await auth.refreshSession()).loggedIn).toBe(false);
    });

    test('sign-up validation runs before any network call', async () => {
        expect(await auth.signUp('A', 'bad', 'password1')).toEqual({ ok: false, error: 'Please enter a valid email address.' });
    });
});

describe('session cache', () => {
    test('round-trips the current user', () => {
        expect(auth.getCurrentUser().loggedIn).toBe(false);
        auth.setCurrentUser({ loggedIn: true, isAdmin: false, name: 'A', email: 'a@b.com', id: 'u1' });
        expect(auth.getCurrentUser().email).toBe('a@b.com');
        auth.clearCurrentUser();
        expect(auth.getCurrentUser().loggedIn).toBe(false);
    });

    test('treats corrupt cache data as logged out', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem('currentUser', '{not json');
        expect(auth.getCurrentUser().loggedIn).toBe(false);
        spy.mockRestore();
    });
});
