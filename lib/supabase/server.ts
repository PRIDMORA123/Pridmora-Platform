import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseConfigured,
  isSupabaseServiceRoleConfigured,
} from "./env";

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

let serviceClient: SupabaseClient | null = null;

/**
 * Server-only service-role client. Bypasses RLS — use only for genuine admin tasks
 * (e.g. one-time demo data claim). Never import from Client Components.
 */
export function getSupabaseServiceClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase server access is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment."
    );
  }

  if (!serviceClient) {
    serviceClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serviceClient;
}

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
