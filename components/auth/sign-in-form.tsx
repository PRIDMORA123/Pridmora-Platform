"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (signingIn) return;
    setError("");
    setSigningIn(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    try {
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
      title="Sign in to your workspace"
      description="Use your account to continue."
      footer={
        <p className="auth-footer-links">
          <Link href="/auth/forgot-password">Forgotten your password?</Link>
          <span aria-hidden>·</span>
          <Link href="/auth/sign-up">Create an account</Link>
        </p>
      }
    >
      <form
        onSubmit={event => {
          void submit(event);
        }}
      >
        <label>
          Email address
          <input type="email" name="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button className="primary full" type="submit" disabled={signingIn} aria-busy={signingIn}>
          {signingIn ? "Signing in..." : "Sign in"} {!signingIn && <ArrowRight size={18} />}
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
