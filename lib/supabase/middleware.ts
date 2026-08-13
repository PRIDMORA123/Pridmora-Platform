import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { extractSupabaseProjectRef } from "@/lib/supabase/project-env";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

function isInvalidRefreshTokenError(error: {
  message?: string;
  code?: string | null;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  const code = String(error.code ?? "").toLowerCase();
  return (
    code.includes("refresh_token") ||
    message.includes("refresh token") ||
    (error.status === 400 && message.includes("refresh"))
  );
}

/**
 * Cookie names belonging to the configured Supabase project only.
 * Never clears another project's sb-<other-ref>-* cookies (Pilot vs IDENTITY).
 */
export function cookieNamesForSupabaseProject(
  cookieNames: string[],
  projectRef: string | null | undefined
): string[] {
  if (!projectRef) return [];
  const prefix = `sb-${projectRef}-`;
  return cookieNames.filter(name => name.startsWith(prefix));
}

export function clearSupabaseAuthCookiesForProject(
  request: NextRequest,
  response: NextResponse,
  projectRef: string | null | undefined
): string[] {
  const cleared = cookieNamesForSupabaseProject(
    request.cookies.getAll().map(cookie => cookie.name),
    projectRef
  );

  for (const name of cleared) {
    request.cookies.delete(name);
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
    });
  }

  return cleared;
}

/**
 * Refreshes the Auth session cookies and returns whether a user is present.
 * Invalid/stale refresh tokens clear only the current project's cookies.
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  userId: string | null;
}> {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    return { response, userId: null };
  }

  const projectRef = extractSupabaseProjectRef(url);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error && isInvalidRefreshTokenError(error)) {
    const cleared = clearSupabaseAuthCookiesForProject(
      request,
      response,
      projectRef
    );
    if (process.env.NODE_ENV !== "production") {
      console.info(
        JSON.stringify({
          source: "auth_middleware",
          outcome: "cleared_invalid_refresh",
          code: error.code ?? null,
          status: error.status ?? null,
          projectRef,
          clearedCount: cleared.length,
        })
      );
    }
    return { response, userId: null };
  }

  return { response, userId: user?.id ?? null };
}
