// auth.js
function authenticateUserMock(email, password) {
  if (email !== 'user@example.com') {
    return 'Invalid email—please signup.';
  } else if (password !== 'password123') {
    return 'Wrong password. Forgot?';
  }
  return { loggedIn: true, isAdmin: false, email };
}
module.exports = { authenticateUserMock };
