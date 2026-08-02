import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next") || "/";
  const next = nextParam.startsWith("/") ? nextParam : "/";
  const errorDescription = requestUrl.searchParams.get("error_description");
  const errorCode = requestUrl.searchParams.get("error");

  if (errorCode || errorDescription) {
    const message = errorDescription || "Email confirmation or password reset failed.";
    return NextResponse.redirect(
      new URL(`/auth/error?message=${encodeURIComponent(message)}`, requestUrl.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(
        `/auth/error?message=${encodeURIComponent("Missing authentication code. Request a new email link.")}`,
        requestUrl.origin
      )
    );
  }

  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    return NextResponse.redirect(
      new URL(
        `/auth/error?message=${encodeURIComponent("Supabase is not configured.")}`,
        requestUrl.origin
      )
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const message = /expired|invalid/i.test(error.message)
      ? "This link has expired or is no longer valid. Please request a new one."
      : "Unable to complete authentication. Please try again.";
    return NextResponse.redirect(
      new URL(`/auth/error?message=${encodeURIComponent(message)}`, requestUrl.origin)
    );
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
