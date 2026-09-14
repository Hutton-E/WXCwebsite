import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase environment variables. Check your .env file has VITE_SUPABASE_URL and VITE_SUPABASE_KEY set.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Don't persist the admin session across page loads — every fresh
    // load of the site should require logging in again, rather than
    // silently staying authenticated from a previous visit.
    persistSession: false,
  },
});
