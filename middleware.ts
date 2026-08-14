import { NextResponse, type NextRequest } from "next/server";
import { buildSafeSignInNext, sanitizeNextPath } from "@/lib/auth/email-link";
import {
  PASSWORD_SETUP_PATH,
  isPasswordSetupAllowedPath,
} from "@/lib/auth/password-setup";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = [
  "/",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/check-email",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/setup-password",
  "/auth/callback",
  "/auth/confirm",
  "/auth/error",
  // Must load without a cookie session so invite/magic-link hash tokens can be
  // consumed. Auth is still enforced by the accept API (email ownership check).
  "/organisation/invitations/accept",
];

/**
 * Public marketing/auth paths only.
 * /owner and /organisation are intentionally NOT public and must not be
 * rewritten into the Manager workspace (`/`).
 */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.filter(path => path !== "/").some(
    path => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function isAuthFlowPath(pathname: string): boolean {
  return pathname.startsWith("/auth/");
}

export async function middleware(request: NextRequest) {
  const { response, userId, passwordSetupRequired } =
    await updateSession(request);
  const { pathname } = request.nextUrl;

  // Let server layouts distinguish invitation accept from gated workspace routes.
  response.headers.set("x-pathname", pathname);

  const isApi = pathname.startsWith("/api/");
  const isDevPreview =
    process.env.NODE_ENV !== "production" && pathname.startsWith("/dev/");
  const isPublic = isPublicPath(pathname) || isDevPreview;

  if (!userId && !isPublic && !isApi) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/sign-in";
    // Preserve pathname + search (invitation tokens, etc.) after open-redirect checks.
    redirectUrl.search = "";
    redirectUrl.searchParams.set(
      "next",
      buildSafeSignInNext(pathname, request.nextUrl.search)
    );
    return NextResponse.redirect(redirectUrl);
  }

  // Unauthenticated visitors on setup-password must sign in first (session required).
  if (!userId && pathname === PASSWORD_SETUP_PATH) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/sign-in";
    redirectUrl.search = "";
    redirectUrl.searchParams.set(
      "next",
      buildSafeSignInNext(PASSWORD_SETUP_PATH, request.nextUrl.search)
    );
    return NextResponse.redirect(redirectUrl);
  }

  // Mandatory first-time password setup: keep invitees on the setup path until done.
  if (userId && passwordSetupRequired && !isApi) {
    if (!isPasswordSetupAllowedPath(pathname)) {
      const intended = buildSafeSignInNext(pathname, request.nextUrl.search);
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = PASSWORD_SETUP_PATH;
      redirectUrl.search = "";
      redirectUrl.searchParams.set("next", sanitizeNextPath(intended, "/"));
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (
    userId &&
    isAuthFlowPath(pathname) &&
    pathname !== "/auth/callback" &&
    pathname !== "/auth/confirm" &&
    pathname !== "/auth/reset-password" &&
    pathname !== "/auth/setup-password" &&
    pathname !== "/auth/check-email" &&
    pathname !== "/auth/error"
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated users without setup required should not use setup as a password-change alternate.
  if (
    userId &&
    pathname === PASSWORD_SETUP_PATH &&
    !passwordSetupRequired
  ) {
    const next = sanitizeNextPath(
      request.nextUrl.searchParams.get("next"),
      "/"
    );
    const redirectUrl = request.nextUrl.clone();
    const safe = sanitizeNextPath(next, "/");
    if (safe.startsWith("/?")) {
      redirectUrl.pathname = "/";
      redirectUrl.search = safe.slice(1);
    } else {
      const [pathOnly, query = ""] = safe.split("?");
      redirectUrl.pathname = pathOnly || "/";
      redirectUrl.search = query ? `?${query}` : "";
    }
    return NextResponse.redirect(redirectUrl);
  }

  // API routes authenticate inside handlers (401 JSON). Middleware only refreshes cookies.
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
