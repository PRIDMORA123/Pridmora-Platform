import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * Terminate the browser Supabase session and leave for sign-in.
 * Shared by Manager AppShell and Organisation Workspace account menus.
 */
export async function signOutToSignIn(): Promise<void> {
  try {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
  } catch {
    // Still leave the workspace even if the network call fails.
  }
  window.location.assign("/auth/sign-in");
}
