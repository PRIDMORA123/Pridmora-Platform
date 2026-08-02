"use client";

import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { AuthRequiredError } from "@/lib/errors";

export { isUuid } from "@/lib/uuid";

/**
 * Read the current browser Auth user. Does not hit coaching APIs.
 */
export async function getBrowserAuthUser(): Promise<User | null> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Ensure a browser session exists before any protected data request.
 */
export async function requireBrowserAuth(): Promise<User> {
  const user = await getBrowserAuthUser();
  if (!user) {
    throw new AuthRequiredError();
  }
  return user;
}
