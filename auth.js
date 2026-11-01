// auth.js — accounts and sessions via Supabase Auth.
// The signed-in user is also cached in localStorage ('currentUser') so pages
// can render instantly; that cache is only a UI hint — the database's
// row-level security is what actually protects data.

const SESSION_CACHE_KEY = 'currentUser';
const LOGGED_OUT = { loggedIn: false, isAdmin: false, name: null, email: null, id: null };

let supabaseClient = null;

function getConfig() {
  return (typeof window !== 'undefined' && window.APP_CONFIG) || {};
}

function isBackendConfigured() {
  const cfg = getConfig();
  return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
}

/** Shared Supabase client, or null when not configured. */
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const cfg = getConfig();
  if (!isBackendConfigured() || typeof window === 'undefined' || !window.supabase) return null;
  supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return supabaseClient;
}

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (e) {
    return null;
  }
}

// ---------------- Validation & messages (pure, unit-tested) ----------------
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

/** Returns an error message, or null when the sign-up form is valid. */
function validateSignup(name, email, password) {
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim();
  if (!cleanName || !cleanEmail || !password) return 'All fields are required.';
  if (cleanName.length > 60) return 'Name must be 60 characters or fewer.';
  if (!isValidEmail(cleanEmail)) return 'Please enter a valid email address.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  return null;
}

/** Returns an error message, or null when the change-password form is valid. */
function validatePasswordChange(current, next, confirm) {
  if (!current || !next || !confirm) return 'All fields are required.';
  if (next.length < 8) return 'New password must be at least 8 characters long.';
  if (next !== confirm) return 'New passwords do not match.';
  if (next === current) return 'New password must be different from your current one.';
  return null;
}

/** Turn Supabase Auth errors into friendly messages. */
function friendlyAuthError(error) {
  const msg = String((error && error.message) || error || '');
  if (/invalid login credentials/i.test(msg)) return 'Invalid email or password.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link.';
  if (/already registered|already been registered|user already exists/i.test(msg)) {
    return 'Email already registered. Please sign in or use a different email.';
  }
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/password should be at least/i.test(msg)) return 'Password must be at least 8 characters long.';
  if (/should be different from the old password/i.test(msg)) return 'New password must be different from your current one.';
  if (/failed to fetch|network/i.test(msg)) return 'Network error — please check your connection.';
  return msg || 'Something went wrong. Please try again.';
}

// ---------------- Session cache ----------------
function getCurrentUser() {
  const ls = getStorage();
  const raw = ls && ls.getItem(SESSION_CACHE_KEY);
  if (!raw) return { ...LOGGED_OUT };
  try {
    const user = JSON.parse(raw);
    return user && user.loggedIn && user.email ? user : { ...LOGGED_OUT };
  } catch (e) {
    console.error('Failed to parse stored user:', e);
    return { ...LOGGED_OUT };
  }
}

function setCurrentUser(session) {
  const ls = getStorage();
  if (ls) ls.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
  return session;
}

function clearCurrentUser() {
  const ls = getStorage();
  if (ls) ls.removeItem(SESSION_CACHE_KEY);
}

// ---------------- Supabase-backed operations ----------------

/** Re-read the session and profile from Supabase and update the cache. */
async function refreshSession() {
  const sb = getSupabase();
  if (!sb) {
    clearCurrentUser();
    return { ...LOGGED_OUT };
  }
  const { data } = await sb.auth.getSession();
  const authUser = data && data.session && data.session.user;
  if (!authUser) {
    clearCurrentUser();
    return { ...LOGGED_OUT };
  }
  const { data: profile, error } = await sb
    .from('profiles')
    .select('name, email, is_admin')
    .eq('id', authUser.id)
    .maybeSingle();
  if (error) console.error('Failed to load profile:', error);

  return setCurrentUser({
    loggedIn: true,
    isAdmin: !!(profile && profile.is_admin),
    name: (profile && profile.name) || (authUser.user_metadata && authUser.user_metadata.name) || authUser.email,
    email: String((profile && profile.email) || authUser.email).toLowerCase(),
    id: authUser.id
  });
}

async function signIn(email, password) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'The booking system is not connected yet.' };
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return { ok: false, error: 'Email and password are required.' };
  const { error } = await sb.auth.signInWithPassword({ email: cleanEmail, password });
  if (error) return { ok: false, error: friendlyAuthError(error) };
  return { ok: true, user: await refreshSession() };
}

/**
 * Create an account. When the Supabase project requires email confirmation
 * there is no session yet, so `needsConfirmation` is returned instead.
 */
async function signUp(name, email, password) {
  const invalid = validateSignup(name, email, password);
  if (invalid) return { ok: false, error: invalid };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'The booking system is not connected yet.' };

  const { data, error } = await sb.auth.signUp({
    email: String(email).trim().toLowerCase(),
    password,
    options: {
      data: { name: String(name).trim() },
      emailRedirectTo: siteUrl('index.html')
    }
  });
  if (error) return { ok: false, error: friendlyAuthError(error) };
  // Supabase hides "already registered" behind an empty identities list
  if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, error: friendlyAuthError('already registered') };
  }
  if (!data || !data.session) return { ok: true, needsConfirmation: true };
  return { ok: true, user: await refreshSession() };
}

async function signOut() {
  const sb = getSupabase();
  clearCurrentUser();
  if (sb) {
    try {
      await sb.auth.signOut();
    } catch (e) {
      console.error('Sign-out failed:', e);
    }
  }
}

async function requestPasswordReset(email) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'The booking system is not connected yet.' };
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) return { ok: false, error: 'Enter your account email above first.' };
  const { error } = await sb.auth.resetPasswordForEmail(cleanEmail, { redirectTo: siteUrl('index.html') });
  return error ? { ok: false, error: friendlyAuthError(error) } : { ok: true };
}

async function updatePassword(password) {
  if (!password || password.length < 8) return { ok: false, error: 'Password must be at least 8 characters long.' };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'The booking system is not connected yet.' };
  const { error } = await sb.auth.updateUser({ password });
  return error ? { ok: false, error: friendlyAuthError(error) } : { ok: true };
}

/**
 * Change the password of the signed-in user. The current password is checked
 * first so an unattended signed-in browser can't be used to take the account.
 */
async function changePassword(currentPassword, newPassword, confirmPassword) {
  const invalid = validatePasswordChange(currentPassword, newPassword, confirmPassword);
  if (invalid) return { ok: false, error: invalid };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'The booking system is not connected yet.' };
  const { data } = await sb.auth.getSession();
  const email = data && data.session && data.session.user && data.session.user.email;
  if (!email) return { ok: false, error: 'Your session has expired. Please sign in again.' };

  const check = await sb.auth.signInWithPassword({ email, password: currentPassword });
  if (check.error) {
    return { ok: false, error: /invalid login credentials/i.test(check.error.message) ? 'Current password is incorrect.' : friendlyAuthError(check.error) };
  }
  const { error } = await sb.auth.updateUser({ password: newPassword });
  return error ? { ok: false, error: friendlyAuthError(error) } : { ok: true };
}

/** Subscribe to auth events (SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY, ...). */
function onAuthChange(callback) {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((event) => callback(event));
  return () => data.subscription.unsubscribe();
}

function siteUrl(page) {
  if (typeof window === 'undefined') return page;
  return new URL(page, window.location.href).href.split('#')[0].split('?')[0];
}

// Export for Node.js tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isValidEmail,
    validateSignup,
    validatePasswordChange,
    friendlyAuthError,
    getCurrentUser,
    setCurrentUser,
    clearCurrentUser,
    isBackendConfigured,
    signIn,
    signUp,
    signOut,
    refreshSession,
    changePassword
  };
}
