import type { User } from "@supabase/supabase-js";
import { sanitizeNextPath } from "@/lib/auth/email-link";

export const PASSWORD_SETUP_PATH = "/auth/setup-password";
export const PASSWORD_SETUP_REQUIRED_KEY = "password_setup_required";

/**
 * True when the Auth user must complete first-time password setup
 * before using password sign-in on another device.
 */
export function userRequiresPasswordSetup(
  user: User | null | undefined
): boolean {
  if (!user) return false;
  const meta = user.user_metadata ?? {};
  return meta[PASSWORD_SETUP_REQUIRED_KEY] === true;
}

/**
 * Safe href for post-accept (or middleware) password setup with internal next.
 */
export function buildPasswordSetupHref(next: string): string {
  const safeNext = sanitizeNextPath(next, "/");
  return `${PASSWORD_SETUP_PATH}?next=${encodeURIComponent(safeNext)}`;
}

/**
 * After organisation invitation acceptance: new Auth users go to password
 * setup; existing users go straight to role landing.
 */
export function resolvePostInvitationAcceptDestination(input: {
  user: User | null | undefined;
  roleLanding: string;
}): string {
  const landing = sanitizeNextPath(input.roleLanding, "/");
  if (userRequiresPasswordSetup(input.user)) {
    return buildPasswordSetupHref(landing);
  }
  return landing;
}

/**
 * Paths allowed while password_setup_required is still true.
 * Accept must remain reachable so membership can complete before setup.
 */
export function isPasswordSetupAllowedPath(pathname: string): boolean {
  if (pathname === PASSWORD_SETUP_PATH) return true;
  if (pathname === "/auth/callback") return true;
  if (pathname === "/auth/confirm") return true;
  if (pathname === "/auth/error") return true;
  if (
    pathname === "/organisation/invitations/accept" ||
    pathname.startsWith("/organisation/invitations/accept/")
  ) {
    return true;
  }
  return false;
}
