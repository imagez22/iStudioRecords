# 🎵 Quick Reference - Authentication System

## Login Credentials

### Admin Account (Only Production Admin)
```
Email: admin@example.com
Password: admin123
```

---

## How to Use

### **To Create a New User Account:**
1. Click "Login" button on homepage
2. Click "Create one" link
3. Fill in the form:
   - Full Name: Your name
   - Email: youremail@example.com (must be unique)
   - Password: Min 8 characters
   - Confirm: Re-enter password
4. Click "Create Account"

### **To Login:**
1. Click "Login" button
2. Enter email and password
3. Click "Submit"

### **To Logout:**
1. Click your username in header
2. Click "Logout"

---

## Features Available

### **For Regular Users:**
- ✅ Create account via signup
- ✅ Book studio sessions
- ✅ View booking history
- ✅ Submit feedback/reviews
- ✅ View personal bookings

### **For Admin (admin@example.com only):**
- ✅ View all bookings
- ✅ Approve/reject bookings
- ✅ Manage studios
- ✅ Manage instruments
- ✅ View all reviews

---

## Validation Rules

| Field | Rule |
|-------|------|
| Email | Must contain @ |
| Email | Must be unique |
| Password | Minimum 8 characters |
| Name | Required field |

---

## Browser Storage

User data is stored in browser's localStorage:
- **Key**: `appUsers`
- **Type**: JSON array
- **Persistence**: Survives page refreshes and browser restart

To view: F12 → Application → Local Storage → localhost:8000 → appUsers

---

## Testing

Run tests: `node test-auth.js`

For detailed test scenarios: See `auth-system-test.md`

---

## File Structure

```
auth.js                 - Authentication functions
modalLogic.js           - Login/signup handlers
db.json                 - Admin account only
test-auth.js            - Test suite
PRODUCTION_READY.md     - Complete documentation
auth-system-test.md     - Testing guide
```

---

## Status: ✅ Production Ready

- ✅ New users can register
- ✅ New users can login
- ✅ All new accounts are non-admin
- ✅ Admin account protected
- ✅ Data persists across sessions
- ✅ All validation working
