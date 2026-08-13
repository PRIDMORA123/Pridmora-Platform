"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPasswordField, AuthTextField } from "@/components/auth/auth-fields";
import {
  logAuthClientDiagnostic,
  mapAuthClientError,
} from "@/lib/auth/client-errors";
import { resolveAuthoritativePostLoginDestination } from "@/lib/auth/post-login-destination";
import { resolveAuthSiteOrigin } from "@/lib/auth/recovery";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SignUpForm() {
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setError("");
    setCreating(true);

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("full_name") || "").trim();
    const professionalTitle = String(form.get("professional_title") || "").trim();
    const organisation = String(form.get("organisation") || "").trim();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setCreating(false);
      return;
    }

    try {
      const supabase = createBrowserSupabaseClient();
      const siteOrigin = resolveAuthSiteOrigin(window.location.origin);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${siteOrigin}/auth/callback?next=/`,
          data: {
            full_name: fullName,
            professional_title: professionalTitle || "Professional Coach",
            organisation: organisation || null,
          },
        },
      });

      if (signUpError) {
        const mapped = mapAuthClientError(signUpError, "sign_up");
        logAuthClientDiagnostic("sign_up", mapped, signUpError);
        setError(mapped.userMessage);
        return;
      }

      // If email confirmation is required, there may be no session yet.
      if (!data.session) {
        window.location.assign(
          `/auth/check-email?email=${encodeURIComponent(email)}`
        );
        return;
      }

      const destination = data.user?.id
        ? await resolveAuthoritativePostLoginDestination(
            supabase,
            data.user.id,
            "/"
          )
        : "/";
      window.location.assign(destination);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AuthShell
      eyebrow="GET STARTED"
      title="Create your workspace."
      description="Begin turning coaching conversations into meaningful development evidence."
      footer={
        <p className="auth-account-prompt">
          Already have an account? <Link href="/auth/sign-in">Sign in</Link>
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
          label="Full name"
          icon="user"
          type="text"
          name="full_name"
          autoComplete="name"
          required
        />
        <AuthTextField
          label="Professional title"
          icon="user"
          type="text"
          name="professional_title"
          autoComplete="organization-title"
          placeholder="Professional Coach"
          required
        />
        <AuthTextField
          label="Organisation"
          icon="user"
          type="text"
          name="organisation"
          autoComplete="organization"
          optional
        />
        <AuthTextField
          label="Email address"
          icon="email"
          type="email"
          name="email"
          autoComplete="email"
          required
        />
        <AuthPasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <button className="auth-submit" type="submit" disabled={creating} aria-busy={creating}>
          {creating ? "Creating account…" : "Create account"}
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
