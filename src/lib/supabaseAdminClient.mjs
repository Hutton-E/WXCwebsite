import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

export async function getAuthenticatedSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = process.env.VITE_SUPABASE_KEY;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!url || (!key && !serviceRoleKey)) {
    throw new Error(
      "Missing VITE_SUPABASE_URL and Supabase server key in .env",
    );
  }

  if (email && password && key) {
    const supabase = createClient(url, key);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(`Failed to authenticate as admin: ${error.message}`);
    }

    return supabase;
  }

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  throw new Error(
    "Set ADMIN_EMAIL / ADMIN_PASSWORD with VITE_SUPABASE_KEY, or provide SUPABASE_SERVICE_ROLE_KEY in .env",
  );
}
