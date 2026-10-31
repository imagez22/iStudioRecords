// Public site configuration. Everything here is safe to publish:
// the Supabase anon key and Paystack public key are designed to be
// public — the database's row-level security does the protecting.
// NEVER put the Supabase service_role key or Paystack secret key here.
window.APP_CONFIG = {
    // Supabase → Project Settings → API
    SUPABASE_URL: 'https://jhmlbksargzzkkurhqne.supabase.co',      // e.g. 'https://abcdefghijklm.supabase.co'
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpobWxia3Nhcmd6emtrdXJocW5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjA5NTQsImV4cCI6MjEwOTAzNjk1NH0.RJzmiCYu1PHYTFrnEFvQYUS96pQJMsMfG9m04HWzOIQ', // the "anon" / "publishable" key

    // Paystack → Settings → API Keys (public key only)
    PAYSTACK_PUBLIC_KEY: 'pk_test_2ac05768a8320b37a79875c8fe510ccd0b910bdf',
    PAYSTACK_CURRENCY: 'GHS'
};
