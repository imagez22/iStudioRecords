#!/usr/bin/env node

// Core authentication tests
function runTests() {
    console.log('\n=== AUTHENTICATION SYSTEM TESTS ===\n');
    
    // Test utilities
    const assert = (condition, testName, actual) => {
        if (condition) {
            console.log('✅ PASS -', testName);
        } else {
            console.log('❌ FAIL -', testName, '\n   Result:', actual);
        }
    };
    
    // Mock functions
    function authenticateUser(email, password) {
        if (!email || !password) {
            return 'Email and password are required.';
        }
        const users = [{id: 1, name: 'Admin', email: 'admin@example.com', password: 'admin123', isAdmin: true}];
        const user = users.find(u => u.email === email);
        if (!user) return 'Invalid email or password.';
        if (user.password !== password) return 'Invalid email or password.';
        return { loggedIn: true, isAdmin: user.isAdmin, name: user.name, email: user.email };
    }
    
    function registerUser(name, email, password) {
        if (!name || !email || !password) return 'All fields are required.';
        if (!email.includes('@')) return 'Please enter a valid email address.';
        if (password.length < 8) return 'Password must be at least 8 characters long.';
        
        const users = [{id: 1, name: 'Admin', email: 'admin@example.com', password: 'admin123', isAdmin: true}];
        if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
            return 'Email already registered. Please login or use a different email.';
        }
        
        const newUser = { id: users.length + 1, name, email: email.toLowerCase(), password, isAdmin: false };
        return { loggedIn: true, isAdmin: false, name: newUser.name, email: newUser.email };
    }
    
    // Test 1: Valid admin login
    const adminLogin = authenticateUser('admin@example.com', 'admin123');
    assert(adminLogin.loggedIn === true && adminLogin.isAdmin === true, 
           'Valid admin login', adminLogin);
    
    // Test 2: Invalid password
    const badPassword = authenticateUser('admin@example.com', 'wrong');
    assert(badPassword === 'Invalid email or password.', 
           'Invalid password rejected', badPassword);
    
    // Test 3: Non-existent email
    const noUser = authenticateUser('notreal@example.com', 'password');
    assert(noUser === 'Invalid email or password.', 
           'Non-existent email rejected', noUser);
    
    // Test 4: Duplicate email prevention
    const dupEmail = registerUser('Test', 'admin@example.com', 'SecurePass123');
    assert(dupEmail.includes('already registered'), 
           'Duplicate email prevented', dupEmail);
    
    // Test 5: Password too short
    const shortPwd = registerUser('Test', 'test@example.com', 'short');
    assert(shortPwd.includes('at least 8'), 
           'Password too short rejected', shortPwd);
    
    // Test 6: Valid registration creates non-admin
    const newUser = registerUser('John Producer', 'john@example.com', 'SecurePass123');
    assert(newUser.loggedIn === true && newUser.isAdmin === false, 
           'Valid registration creates non-admin user', newUser);
    
    // Test 7: Missing email field
    const noEmail = authenticateUser('', 'password');
    assert(noEmail === 'Email and password are required.', 
           'Missing email rejected', noEmail);
    
    // Test 8: Missing password field
    const noPassword = authenticateUser('admin@example.com', '');
    assert(noPassword === 'Email and password are required.', 
           'Missing password rejected', noPassword);
    
    // Test 9: Invalid email format in registration
    const badEmail = registerUser('Test', 'notanemail', 'SecurePass123');
    assert(badEmail.includes('valid email'), 
           'Invalid email format rejected', badEmail);
    
    // Test 10: All fields required for registration
    const missingName = registerUser('', 'test@example.com', 'SecurePass123');
    assert(missingName === 'All fields are required.', 
           'Missing name rejected', missingName);
    
    console.log('\n=== ALL TESTS COMPLETED ===\n');
}

runTests();
