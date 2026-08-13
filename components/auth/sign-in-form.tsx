"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPasswordField, AuthTextField } from "@/components/auth/auth-fields";
import {
  logAuthClientDiagnostic,
  mapAuthClientError,
} from "@/lib/auth/client-errors";
import { resolveAuthoritativePostLoginDestination } from "@/lib/auth/post-login-destination";
import { extractSupabaseProjectRef } from "@/lib/supabase/project-env";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const REMEMBER_EMAIL_KEY = "pridmora.auth.rememberEmail";

export function SignInForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [savedEmail, setSavedEmail] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (stored) {
        setSavedEmail(stored);
        setRememberMe(true);
      }
    } catch {
      // Ignore storage access failures.
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    // preventDefault is also applied in the JSX handler so a late/async path
    // cannot native-submit. method=post avoids credentials in the query string.
    event.preventDefault();
    if (signingIn) return;
    setError("");
    setErrorCode(null);
    setSigningIn(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const remember = form.get("remember") === "on";

    try {
      try {
        if (remember) {
          window.localStorage.setItem(REMEMBER_EMAIL_KEY, email);
        } else {
          window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }
      } catch {
        // Ignore storage access failures.
      }

      const supabase = createBrowserSupabaseClient();
      if (process.env.NODE_ENV !== "production") {
        console.info(
          JSON.stringify({
            source: "auth_client",
            context: "sign_in",
            stage: "password_grant_start",
            projectRef: extractSupabaseProjectRef(
              process.env.NEXT_PUBLIC_SUPABASE_URL
            ),
          })
        );
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        const mapped = mapAuthClientError(signInError, "sign_in");
        logAuthClientDiagnostic("sign_in", mapped, signInError);
        setError(mapped.userMessage);
        setErrorCode(mapped.publicCode);
        return;
      }

      if (!data.session || !data.user?.id) {
        setError("Unable to establish a session. Please try again.");
        setErrorCode("AUTH_SESSION_MISSING");
        return;
      }

      const requested = nextPath.startsWith("/") ? nextPath : "/";
      const destination = await resolveAuthoritativePostLoginDestination(
        supabase,
        data.user.id,
        requested
      );

      if (process.env.NODE_ENV !== "production") {
        console.info(
          JSON.stringify({
            source: "auth_client",
            context: "sign_in",
            stage: "destination_resolved",
            authGrantSucceeded: true,
            destinationResolved: true,
          })
        );
      }

      // Hard navigation so the next document request includes Auth cookies.
      window.location.assign(destination);
      return;
    } catch {
      setError("Network error. Please check your connection and try again.");
      setErrorCode("AUTH_NETWORK");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <AuthShell
      eyebrow="WELCOME BACK"
      title="Welcome back"
      description="Continue building better conversations."
      supporting="Sign in securely to return to your workspace."
      footer={
        <p className="auth-account-prompt">
          Don&apos;t have an account? <Link href="/auth/sign-up">Create an account</Link>
        </p>
      }
    >
      <form
        className="auth-form-fields"
        method="post"
        action="#"
        onSubmit={event => {
          event.preventDefault();
          void submit(event);
        }}
      >
        <AuthTextField
          key={savedEmail ? `remembered-${savedEmail}` : "email"}
          label="Email address"
          icon="email"
          type="email"
          name="email"
          autoComplete="username"
          defaultValue={savedEmail}
          required
        />
        <AuthPasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
        />
        <div className="auth-form-row">
          <label className="auth-remember">
            <input
              type="checkbox"
              name="remember"
              checked={rememberMe}
              onChange={event => setRememberMe(event.currentTarget.checked)}
            />
            <span>Remember me</span>
          </label>
          <Link className="auth-inline-link" href="/auth/forgot-password">
            Forgot your password?
          </Link>
        </div>
        <button className="auth-submit" type="submit" disabled={signingIn} aria-busy={signingIn}>
          {signingIn ? "Signing in…" : "Sign in"}
        </button>
        {error ? (
          <p className="inline-notice error" role="alert">
            {error}
            {errorCode ? (
              <>
                {" "}
                <span data-auth-error-code={errorCode}>({errorCode})</span>
              </>
            ) : null}
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
