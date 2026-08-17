import { createServerClient } from "@supabase/ssr";
import { type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseConfigured,
  isSupabaseServiceRoleConfigured,
} from "./env";
import { getSupabaseServiceClient } from "./service-role";

/**
 * Authenticated Supabase client for Server Components, Route Handlers, and Server Actions.
 * Uses the anon key + user session cookies so RLS enforces ownership.
 */
export async function createAuthenticatedServerClient(): Promise<SupabaseClient> {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component where cookies are read-only — middleware refreshes the session.
        }
      },
    },
  });
}

/**
 * Server-only service-role client. Bypasses RLS — use only for genuine admin tasks
 * (e.g. one-time demo data claim). Never import from Client Components.
 */
export { getSupabaseServiceClient };

export function isSupabaseServerConfigured(): boolean {
  return isSupabaseServiceRoleConfigured();
}

export { isSupabaseConfigured, isSupabaseServiceRoleConfigured };

export async function getSessionUser(): Promise<User | null> {
  const supabase = await createAuthenticatedServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
