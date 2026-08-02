/**
 * @deprecated Use createBrowserSupabaseClient from @/lib/supabase/browser.
 * Kept as a thin re-export for any residual imports.
 */
export {
  getSupabaseUrl,
  getSupabaseAnonKey,
  isSupabaseConfigured,
} from "./env";

export { createBrowserSupabaseClient as getSupabaseClient } from "./browser";
