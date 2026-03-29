// ============================================================
// SUPABASE CONFIGURATION
// REPLACE: Fill in your Supabase project URL and anon key
// Found at: supabase.com → your project → Settings → API
// ============================================================

const SUPABASE_URL = "https://pofmhobxednullgxtoah.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvZm1ob2J4ZWRudWxsZ3h0b2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDQ1ODUsImV4cCI6MjA5MDMyMDU4NX0.UkQo6Kpxw_ZFBp9SYvSGYoYj3XBuqj9nZTyI4Gf5kV4";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
