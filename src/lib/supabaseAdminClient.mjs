import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

export async function getAuthenticatedSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_KEY;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!url || !key) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_KEY in .env");
  }
  if (!email || !password) {
    throw new Error("Missing ADMIN_EMAIL / ADMIN_PASSWORD in .env");
  }

  const supabase = createClient(url, key);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Failed to authenticate as admin: ${error.message}`);
  }

  return supabase;
}
