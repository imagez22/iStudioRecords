# 🎵 Quick Reference — I Studio Records

The site is static HTML/JS, deployed on **Netlify** at <https://istudiorecords.space>. Accounts, bookings, reviews and
prices live in **Supabase**; payments go through **Paystack** and are verified by the
`book` Edge Function. Full setup: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

---

## Run locally

```bash
npm install
npm start            # http://localhost:8000
```

`config.js` must hold your Supabase project URL and anon key, otherwise the site
shows a "not connected" banner.

## Accounts

- **Clients** sign up on the site (Login → *Create one*) and confirm their email.
  Passwords must be at least 8 characters.
- **There is no default admin.** Create a normal account, then in the Supabase
  SQL Editor run:

  ```sql
  update public.profiles set is_admin = true where email = 'you@example.com';
  ```

  Sign out and back in to reach the admin panel. Nobody can make themselves admin
  from the site — the database blocks it.

## What each role can do

| Clients | Admins |
|---|---|
| Book and pay for sessions | See and approve/reject all bookings |
| See and cancel their own upcoming bookings | Edit studios, prices and instruments |
| Leave reviews | Feature reviews as testimonials |
| | Review payment issues (paid but slot lost) |

## Test payment (Paystack test mode)

Card **4084 0840 8408 4081**, any future expiry, CVV **408**, PIN **0000**, OTP **123456**.

## Tests

```bash
npm test             # unit + database (real migration in PGlite) + function tests
npm run test:e2e     # browser tests in Chrome against a local Supabase stand-in
```

## Key files

```
index.html, scripts.js     Public site and booking flow
store.js                   Data access (Supabase) and caching
auth.js, modalLogic.js     Sign-in / sign-up
user-dashboard.html        Client dashboard
admin.html, admin.js       Admin panel
config.js                  Public keys only (Supabase anon, Paystack public)
supabase/                  Database migration, seed data, `book` function
netlify.toml               Netlify headers and blocked paths for the live site
```
