import { headers } from "next/headers";
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

function requestedHomePath(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const path = pathname.startsWith("/") ? pathname : "/";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (typeof value === "string") {
      query.set(key, value);
    }
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * Public marketing homepage for visitors.
 * Authenticated users enter the development workspace — unless the active
 * organisation membership is Lead/admin (or platform owner), in which case
 * the same post-login destination rules apply on every visit to `/`.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser().catch(() => null);

  if (!user) {
    return <MarketingHomepage />;
  }

  const headerList = await headers();
  const pathname = headerList.get("x-pathname") || "/";
  const resolvedSearch = searchParams ? await searchParams : {};
  const requestedNext = requestedHomePath(pathname, resolvedSearch);

  let destination = "/";
  try {
    const supabase = await createAuthenticatedServerClient();
    destination = await resolveAuthoritativePostLoginDestination(
      supabase,
      user.id,
      requestedNext
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
