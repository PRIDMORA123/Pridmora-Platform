import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = [
  "/",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/check-email",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/callback",
  "/auth/confirm",
  "/auth/error",
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
  const { response, userId } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isApi = pathname.startsWith("/api/");
  const isDevPreview =
    process.env.NODE_ENV !== "production" && pathname.startsWith("/dev/");
  const isPublic = isPublicPath(pathname) || isDevPreview;

  if (
    !userId &&
    !isPublic &&
    !isApi
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/sign-in";
    redirectUrl.searchParams.set("next", pathname === "/" ? "/?view=dashboard" : pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (
    userId &&
    isAuthFlowPath(pathname) &&
    pathname !== "/auth/callback" &&
    pathname !== "/auth/confirm" &&
    pathname !== "/auth/reset-password" &&
    pathname !== "/auth/check-email" &&
    pathname !== "/auth/error"
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
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
