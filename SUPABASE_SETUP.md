# Connecting I Studio Records to Supabase

The site is static HTML/JS. Everything shared and secure — accounts, bookings,
reviews, prices, payment verification — lives in your Supabase project:

| Piece | Where | What it does |
|---|---|---|
| Database schema + security rules | `supabase/migrations/…_init.sql` | Tables, row-level security, pricing, availability, no-double-booking constraint |
| Starting data | `supabase/seed.sql` | The 5 studios (with prices), 6 instruments, 4 testimonials |
| `book` Edge Function | `supabase/functions/book/` | Verifies the Paystack payment with your **secret** key, then saves the booking |
| Site config | `config.js` | Your project URL + public anon key |

Setup takes about 15 minutes. You need Node.js (already used for `npm test`).

---

## 1. Create the project

1. Sign in at <https://supabase.com/dashboard> and click **New project**.
2. Name it (e.g. `istudiorecords`), set a strong database password (save it in a password manager), and pick the region closest to Ghana — **West EU (London)** is a good choice.
3. Wait for it to finish provisioning.

## 2. Create the database

From the project folder:

```bash
npx supabase login                                   # opens the browser once
npx supabase link --project-ref YOUR_PROJECT_REF     # the ref is in your dashboard URL: /project/<ref>
npx supabase db push --include-seed                  # creates tables, rules and starting data
```

**No CLI?** In the dashboard open **SQL Editor**, paste the whole of
`supabase/migrations/20261004000000_init.sql`, run it, then paste and run `supabase/seed.sql`.

## 3. Deploy the booking function

```bash
npx supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxx
npx supabase secrets set ALLOWED_ORIGIN=https://istudiorecords.space,https://istudiorecordx.netlify.app   # optional, recommended — list every address the site is served from
npx supabase functions deploy book
```

- Get the secret key from Paystack → **Settings → API Keys & Webhooks**. It must stay
  out of the website code — only the function can see it.
- Paystack charges in **GHS**. Your Paystack account must be a Ghana merchant account.
  If it is Nigerian, also run `npx supabase secrets set PAYSTACK_CURRENCY=NGN` and set
  `PAYSTACK_CURRENCY: 'NGN'` in `config.js`.
- **Testing without Paystack:** `npx supabase secrets set ALLOW_DEMO_PAYMENTS=true` lets
  bookings through without payment (marked "demo — not charged"). Unset it before launch:
  `npx supabase secrets unset ALLOW_DEMO_PAYMENTS`.

## 4. Configure sign-in emails

Dashboard → **Authentication → URL Configuration**:

- **Site URL:** your live site, `https://istudiorecords.space`
- **Redirect URLs:** add `https://istudiorecords.space/**`, `https://istudiorecordx.netlify.app/**` and `http://localhost:8000/**`

Dashboard → **Authentication → Providers → Email**: keep **Confirm email** on.
New users get a link before they can sign in.

> Supabase's built-in email sender only allows a few emails per hour. Before launch,
> add your own SMTP (e.g. Resend, Brevo, Gmail SMTP) under **Authentication → Emails → SMTP Settings**.

## 5. Point the site at your project

Dashboard → **Project Settings → API**. Copy the **Project URL** and the **anon / publishable** key into `config.js`:

```js
SUPABASE_URL: 'https://abcdefghijklm.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi…',
```

Both values are public by design — the database rules protect the data.
**Never** put the `service_role` key or the Paystack secret key in `config.js`.

## 6. Make yourself the admin

1. Run the site (`npm start`, then open <http://localhost:8000>) and **create an account** with your email.
2. Confirm it from your inbox.
3. In the dashboard **SQL Editor**, run:

   ```sql
   update public.profiles set is_admin = true where email = 'you@example.com';
   ```

4. Sign out and back in — you'll land on the admin panel.

## 7. Test a booking

Use a Paystack test card: **4084 0840 8408 4081**, any future expiry, CVV **408**,
PIN **0000**, OTP **123456**. The booking appears in your dashboard and in the admin panel,
and in Supabase under **Table Editor → bookings** with `payment_status = paid`.

## Going live

1. In `config.js`, replace the Paystack `pk_test_…` key with your `pk_live_…` key.
2. `npx supabase secrets set PAYSTACK_SECRET_KEY=sk_live_…` (and unset `ALLOW_DEMO_PAYMENTS` if you set it).
3. Push to `main` — Netlify redeploys automatically and applies `netlify.toml`.

---

## How it works

- **Browsing** — anyone can read studios, instruments, testimonials and *which hours are taken*
  (never who booked them).
- **Booking** — the browser asks the database for the price and availability, opens Paystack,
  and then calls the `book` function. The function confirms with Paystack that the payment
  succeeded, is in GHS, belongs to the signed-in user and covers the server-calculated price —
  only then is the booking written.
- **No double bookings** — a database constraint rejects overlapping active bookings for a studio,
  even if two people pay at the same moment. If someone pays but loses that race, the payment is
  recorded under **Admin → Payment Issues** so you can refund or rebook them.
- **Permissions** — clients can only see their own bookings and reviews and can only cancel their
  own upcoming bookings. Only admins can approve bookings, change prices, edit the catalogue or
  feature reviews. Nobody can make themselves admin.

## Tests

```bash
npm test            # unit tests + database tests (real migration in PGlite) + function tests
npm run test:e2e    # browser tests in Chrome against a local Supabase stand-in
```

The tests run the real migration in [PGlite](https://pglite.dev) (Postgres in WebAssembly),
so no Docker or Supabase account is needed.
