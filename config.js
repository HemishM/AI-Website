// ============================================================
// SUPABASE CONFIGURATION
// REPLACE: Fill in your Supabase project URL and anon key
// Found at: supabase.com → your project → Settings → API
// ============================================================

const SUPABASE_URL = "YOUR_SUPABASE_URL";         // REPLACE: e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"; // REPLACE: your project's anon/public key

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
