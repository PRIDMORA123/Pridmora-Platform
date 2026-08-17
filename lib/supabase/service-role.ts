import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/env";

/**
 * Server-only service-role client. Bypasses RLS — use only after application
 * authz for genuine privileged tasks (e.g. internal OI aggregation).
 * Safe to import from API routes and server libs that are not pulled into
 * Client Components (does not import next/headers).
 */
let serviceClient: SupabaseClient | null = null;

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

export { isSupabaseServiceRoleConfigured };
