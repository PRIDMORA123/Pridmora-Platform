import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "./env";

let browserClient: SupabaseClient | null = null;

/**
 * Browser Supabase client with persistent Auth session (cookies via @supabase/ssr).
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    if (configuredUrl && !url) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL must be a Supabase project URL (https://<project-ref>.supabase.co), not the application site URL."
      );
    }
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the environment."
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }

  return browserClient;
}

export { isSupabaseConfigured };
