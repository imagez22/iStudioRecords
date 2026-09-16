# Authentication System Test Guide

## Production-Ready Authentication System

### Setup Summary
- ✅ Database (db.json): Contains only one admin account
  - Email: `admin@example.com`
  - Password: `admin123`
  - Role: Admin

- ✅ User Database Storage: 
  - Uses localStorage with key `appUsers`
  - Persists across browser sessions
  - Initialized from db.json on first load

- ✅ Authentication Features:
  - Users can create non-admin accounts via signup form
  - Password requirements: minimum 8 characters
  - Email validation (must contain @)
  - Duplicate email prevention
  - Secure login validation
  - Session persistence in localStorage

---

## Test Scenarios

### Test 1: Admin Login
**Steps:**
1. Navigate to http://localhost:8000/
2. Click "Login" button
3. Enter email: `admin@example.com`
4. Enter password: `admin123`
5. Click Submit

**Expected Result:**
- ✅ Redirects to admin.html
- ✅ Shows "Welcome, Admin!" in header
- ✅ Has access to admin panel (bookings, studios, instruments, reviews)

---

### Test 2: Create New User Account
**Steps:**
1. Navigate to http://localhost:8000/
2. Click "Login" button
3. Click "Create one" link in signup section
4. Enter name: `John Producer`
5. Enter email: `john@example.com`
6. Enter password: `SecurePass123`
7. Confirm password: `SecurePass123`
8. Click "Create Account"

**Expected Result:**
- ✅ Account is created (shows success, no error)
- ✅ Redirects to user-dashboard.html
- ✅ Shows "Welcome, John Producer!" in header
- ✅ User is NOT an admin

---

### Test 3: Login with New User Account
**Steps:**
1. Clear browser cache or logout
2. Navigate to http://localhost:8000/
3. Click "Login" button
4. Enter email: `john@example.com`
5. Enter password: `SecurePass123`
6. Click Submit

**Expected Result:**
- ✅ Login succeeds
- ✅ Redirects to user-dashboard.html
- ✅ Shows "Welcome, John Producer!" in header
- ✅ Can see booking and feedback history

---

### Test 4: Duplicate Email Prevention
**Steps:**
1. Navigate to http://localhost:8000/
2. Click "Login" button
3. Click "Create one" link
4. Enter name: `Another User`
5. Enter email: `john@example.com` (same as existing user)
6. Enter password: `SecurePass456`
7. Confirm password: `SecurePass456`
8. Click "Create Account"

**Expected Result:**
- ❌ Should show error: "Email already registered. Please login or use a different email."
- ✅ Account is NOT created
- ✅ User remains on signup form

---

### Test 5: Password Validation - Too Short
**Steps:**
1. Navigate to http://localhost:8000/
2. Click "Login" button
3. Click "Create one" link
4. Enter name: `Test User`
5. Enter email: `test@example.com`
6. Enter password: `Short1` (less than 8 characters)
7. Confirm password: `Short1`
8. Click "Create Account"

**Expected Result:**
- ❌ Should show error: "Password must be at least 8 characters long."
- ✅ Account is NOT created

---

### Test 6: Password Mismatch
**Steps:**
1. Navigate to http://localhost:8000/
2. Click "Login" button
3. Click "Create one" link
4. Enter name: `Test User`
5. Enter email: `test@example.com`
6. Enter password: `SecurePass123`
7. Confirm password: `DifferentPass456`
8. Click "Create Account"

**Expected Result:**
- ❌ Should show error: "Passwords do not match."
- ✅ Account is NOT created

---

### Test 7: Session Persistence
**Steps:**
1. Create a test account as in Test 2
2. After redirect to user-dashboard.html
3. Refresh the page (F5 or Ctrl+R)
4. Check header greeting

**Expected Result:**
- ✅ User remains logged in
- ✅ Shows "Welcome, John Producer!" still visible
- ✅ Session persists across page refreshes

---

### Test 8: Logout
**Steps:**
1. Login as any user
2. Click "Logout" button (should be in header menu)
3. Try to access user-dashboard.html directly

**Expected Result:**
- ✅ Logging out clears the session
- ✅ On refresh or back to index, should show "Login" button instead of username

---

### Test 9: Non-Admin User Restrictions
**Steps:**
1. Login as a non-admin user (Test user or Test 2 user)
2. Try to navigate directly to admin.html

**Expected Result:**
- ✅ Admin features are NOT accessible to non-admin users
- ✅ User cannot see admin panel data

---

### Test 10: Multiple User Accounts
**Steps:**
1. Create Account 1: email `artist1@example.com`
2. Logout
3. Create Account 2: email `artist2@example.com`
4. Logout
5. Login with Account 1

**Expected Result:**
- ✅ Both accounts are independent
- ✅ Each user can login with their credentials
- ✅ Each user has separate booking and feedback history
- ✅ All accounts remain non-admin

---

## Local Storage Verification

To verify user data is properly stored:

1. Open browser Developer Tools (F12)
2. Go to Application > Local Storage > http://localhost:8000
3. Look for key `appUsers`
4. Click to view the value

**Expected Structure:**
```json
{
  "appUsers": [
    {
      "id": 1,
      "name": "Admin",
      "email": "admin@example.com",
      "password": "admin123",
      "isAdmin": true
    },
    {
      "id": 2,
      "name": "John Producer",
      "email": "john@example.com",
      "password": "SecurePass123",
      "isAdmin": false
    }
  ]
}
```

---

## Error Scenarios

| Scenario | Input | Expected Error |
|----------|-------|-----------------|
| Missing email | Login with empty email | "Invalid email or password." |
| Missing password | Login with empty password | "Invalid email or password." |
| Wrong password | email: admin@example.com, pwd: wrongpwd | "Invalid email or password." |
| Invalid email format | email: notanemail, password: test | "Please enter a valid email address." |
| Empty name | signup: name "", email: test@example.com | "All fields are required." |
| Password too short | password: "abcd123" (7 chars) | "Password must be at least 8 characters long." |
| Passwords don't match | pwd: "Test1234", confirm: "Test1235" | "Passwords do not match." |

---

## Production Checklist

- ✅ Only one admin account in production (admin@example.com)
- ✅ All new users are created as non-admin
- ✅ Password validation enforced (8+ characters)
- ✅ Email validation enforced (must contain @)
- ✅ Duplicate email prevention
- ✅ Users can create accounts via signup
- ✅ Users can login with their accounts
- ✅ Session persistence via localStorage
- ✅ User data persisted in localStorage
- ✅ Admin-only features protected
- ✅ Logout functionality works

---

## Technical Details

### Files Modified:
1. **auth.js** - New authentication module with functions:
   - `authenticateUser()` - Validates login credentials
   - `registerUser()` - Creates new user accounts
   - `getAllUsers()` - Retrieves users from localStorage
   - `saveUsers()` - Persists users to localStorage
   - `initializeUsersFromDB()` - Sets up users on first load

2. **modalLogic.js** - Updated:
   - Login button handler to use `authenticateUser()`
   - Signup button handler to use `registerUser()`
   - Proper error message display

3. **scripts.js** - Updated:
   - Calls `initializeUsersFromDB()` when loading data

4. **db.json** - Cleaned:
   - Removed test user account
   - Removed test bookings and feedbacks
   - Kept only admin account

5. **index.html, user-dashboard.html, admin.html** - Updated:
   - Added auth.js to script loading order
   - Correct dependency order maintained

### Security Notes:
⚠️ **Important for Production:**
- This is a client-side authentication system suitable for demo/development
- For true production, implement server-side authentication
- Never store passwords in plain text in production
- Use proper password hashing (bcrypt, argon2, etc.)
- Use HTTPS for all authentication requests
- Consider JWT tokens for session management

---

## Support

If you encounter issues:
1. Check browser console (F12 > Console tab) for error messages
2. Verify localStorage data structure
3. Clear localStorage and refresh if issues persist
4. Ensure auth.js is loaded before modalLogic.js
