"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPasswordField, AuthTextField } from "@/components/auth/auth-fields";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const REMEMBER_EMAIL_KEY = "pridmora.auth.rememberEmail";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [error, setError] = useState("");
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
    event.preventDefault();
    if (signingIn) return;
    setError("");
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
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(
          signInError.message.toLowerCase().includes("email not confirmed")
            ? "Please confirm your email address before signing in. Check your inbox for a verification link."
            : "Unable to sign in. Check your email and password, then try again."
        );
        return;
      }

      router.replace(nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
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
        onSubmit={event => {
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
              onChange={event => setRememberMe(event.target.checked)}
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
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
