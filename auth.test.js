const { authenticateUserMock } = require('./auth');

test('valid login', () => {
  expect(authenticateUserMock('user@example.com','password123'))
    .toEqual({ loggedIn:true, isAdmin:false, email:'user@example.com' });
});

test('invalid email', () => {
  expect(authenticateUserMock('wrong@example.com','password123'))
    .toBe('Invalid email—please signup.');
});

test('wrong password', () => {
  expect(authenticateUserMock('user@example.com','wrong'))
    .toBe('Wrong password. Forgot?');
});

test('empty credentials', () => {
  expect(authenticateUserMock('',''))
    .toBe('Invalid email—please signup.');
});
