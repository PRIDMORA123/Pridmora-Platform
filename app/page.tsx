import { redirect } from "next/navigation";
import { HomeApp } from "@/components/home-app";
import { MarketingHomepage } from "@/components/marketing-homepage";
import {
  isHomeWorkspacePath,
  resolveAuthoritativePostLoginDestination,
} from "@/lib/auth/post-login-destination";
import {
  createAuthenticatedServerClient,
  getSessionUser,
} from "@/lib/supabase/server";

/**
 * Public marketing homepage for visitors.
 * Authenticated users enter the development workspace — unless the active
 * organisation membership is Lead/admin (or platform owner), in which case
 * the same post-login destination rules apply on every visit to `/`.
 */
export default async function HomePage() {
  const user = await getSessionUser().catch(() => null);

  if (!user) {
    return <MarketingHomepage />;
  }

  let destination = "/";
  try {
    const supabase = await createAuthenticatedServerClient();
    destination = await resolveAuthoritativePostLoginDestination(
      supabase,
      user.id,
      "/"
    );
  } catch {
    // Fall through to Manager home if session/org routing cannot be resolved.
    return <HomeApp />;
  }

  // Post-login routing previously ran only at sign-in. Authenticated
  // navigations to `/` must honour the active organisation membership.
  // redirect() must stay outside try/catch — Next.js implements it by throwing.
  if (!isHomeWorkspacePath(destination)) {
    redirect(destination);
  }

  return <HomeApp />;
}
