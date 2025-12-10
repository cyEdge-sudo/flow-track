import { createClient as createSbClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

// Server-only admin client with service role key (bypasses RLS).
// Ensure SUPABASE_SERVICE_ROLE_KEY is set on the server environment.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client."
    );
  }

  return createSbClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
