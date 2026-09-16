// auth.js - Authentication utility functions

/**
 * Get all users from localStorage (persistent user database)
 * Falls back to db.json data if localStorage is empty
 */
function getAllUsers() {
  const stored = localStorage.getItem('appUsers');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse stored users:', e);
      return [];
    }
  }
  // If nothing in localStorage, initialize with empty array
  return [];
}

/**
 * Save users to localStorage for persistence
 */
function saveUsers(users) {
  try {
    localStorage.setItem('appUsers', JSON.stringify(users));
  } catch (e) {
    console.error('Failed to save users:', e);
  }
}

/**
 * Authenticate user by email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Object|string} - User object if valid, error message if not
 */
function authenticateUser(email, password) {
  if (!email || !password) {
    return 'Email and password are required.';
  }

  const users = getAllUsers();
  const user = users.find(u => u.email === email);

  if (!user) {
    return 'Invalid email or password.';
  }

  if (user.password !== password) {
    return 'Invalid email or password.';
  }

  return {
    loggedIn: true,
    isAdmin: user.isAdmin || false,
    name: user.name,
    email: user.email
  };
}

/**
 * Register a new user
 * @param {string} name - User full name
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Object|string} - User object if successful, error message if not
 */
function registerUser(name, email, password) {
  // Validation
  if (!name || !email || !password) {
    return 'All fields are required.';
  }

  if (!email.includes('@')) {
    return 'Please enter a valid email address.';
  }

  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }

  const users = getAllUsers();

  // Check if email already exists
  const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    return 'Email already registered. Please login or use a different email.';
  }

  // Create new non-admin user
  const newUser = {
    id: users.length + 1,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: password,
    isAdmin: false // All new registrations are non-admin
  };

  users.push(newUser);
  saveUsers(users);

  return {
    loggedIn: true,
    isAdmin: false,
    name: newUser.name,
    email: newUser.email
  };
}

/**
 * Initialize app with admin user from db.json on first load
 */
function initializeUsersFromDB(dbUsers) {
  const stored = localStorage.getItem('appUsers');
  if (!stored && dbUsers && dbUsers.length > 0) {
    // First time - load users from db.json
    saveUsers(dbUsers);
  }
}

/**
 * Legacy function for backwards compatibility
 */
function authenticateUserMock(email, password) {
  return authenticateUser(email, password);
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    authenticateUser,
    authenticateUserMock,
    registerUser,
    getAllUsers,
    saveUsers,
    initializeUsersFromDB
  };
}
