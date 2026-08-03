import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

/**
 * Route-handler Supabase client that collects Set-Cookie mutations so they can
 * be applied to a redirect response (cookies().set alone does not attach them).
 */
export function createAuthRouteClient(request: Request): {
  supabase: ReturnType<typeof createServerClient>;
  configured: boolean;
  applyCookies: (response: NextResponse) => NextResponse;
} {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    return {
      supabase: null as unknown as ReturnType<typeof createServerClient>,
      configured: false,
      applyCookies: response => response,
    };
  }

  const pending: PendingCookie[] = [];
  const requestCookies = parseCookieHeader(request.headers.get("cookie"));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return requestCookies;
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const existing = requestCookies.find(cookie => cookie.name === name);
          if (existing) {
            existing.value = value;
          } else {
            requestCookies.push({ name, value });
          }
          pending.push({ name, value, options: options ?? {} });
        });
      },
    },
  });

  return {
    supabase,
    configured: true,
    applyCookies(response: NextResponse) {
      pending.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    },
  };
}

export function authErrorRedirect(
  origin: string,
  message: string,
  applyCookies?: (response: NextResponse) => NextResponse
): NextResponse {
  const response = NextResponse.redirect(
    new URL(`/auth/error?message=${encodeURIComponent(message)}`, origin)
  );
  return applyCookies ? applyCookies(response) : response;
}

export function authSuccessRedirect(
  origin: string,
  nextPath: string,
  applyCookies: (response: NextResponse) => NextResponse
): NextResponse {
  return applyCookies(NextResponse.redirect(new URL(nextPath, origin)));
}

function parseCookieHeader(header: string | null): Array<{ name: string; value: string }> {
  if (!header) return [];
  return header.split(";").flatMap(part => {
    const trimmed = part.trim();
    if (!trimmed) return [];
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return [];
    return [{ name: trimmed.slice(0, eq), value: trimmed.slice(eq + 1) }];
  });
}
