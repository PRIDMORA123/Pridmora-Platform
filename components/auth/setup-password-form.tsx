"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPasswordField } from "@/components/auth/auth-fields";
import {
  logAuthClientDiagnostic,
  mapAuthClientError,
} from "@/lib/auth/client-errors";
import { sanitizeNextPath } from "@/lib/auth/email-link";
import {
  PASSWORD_SETUP_REQUIRED_KEY,
  userRequiresPasswordSetup,
} from "@/lib/auth/password-setup";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type Phase = "loading" | "ready" | "unauthenticated" | "not_required";

export function SetupPasswordForm() {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const nextPath = sanitizeNextPath(searchParams.get("next"), "/");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;

        if (userError || !data.user) {
          const signInNext = `/auth/setup-password?next=${encodeURIComponent(nextPath)}`;
          window.location.assign(
            `/auth/sign-in?next=${encodeURIComponent(signInNext)}`
          );
          setPhase("unauthenticated");
          return;
        }

        if (!userRequiresPasswordSetup(data.user)) {
          window.location.assign(nextPath);
          setPhase("not_required");
          return;
        }

        setPhase("ready");
      } catch {
        if (!cancelled) {
          setPhase("unauthenticated");
          setError("Unable to verify your session. Please sign in again.");
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [nextPath]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || phase !== "ready") return;
    setError("");
    setSaving(true);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm_password") || "");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setSaving(false);
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      setSaving(false);
      return;
    }

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { [PASSWORD_SETUP_REQUIRED_KEY]: false },
      });

      if (updateError) {
        const mapped = mapAuthClientError(updateError, "setup_password");
        logAuthClientDiagnostic("setup_password", mapped, updateError);
        setError(mapped.userMessage);
        return;
      }

      setSuccess(true);
      window.location.assign(nextPath);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "loading" || phase === "unauthenticated" || phase === "not_required") {
    return (
      <AuthShell eyebrow="SET UP YOUR ACCOUNT" title="Preparing your account…">
        <p className="auth-form__description">
          {phase === "unauthenticated"
            ? "Redirecting to sign in…"
            : "Checking your account…"}
        </p>
        {error ? (
          <p className="inline-notice error" role="alert">
            {error}
          </p>
        ) : null}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="SET UP YOUR ACCOUNT"
      title="Set up your account"
      description="Create your password so you can sign in to Pridmora on any device."
      supporting="This is a one-time step for new invitations."
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
        <AuthPasswordField
          label="Create your password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <AuthPasswordField
          label="Confirm password"
          name="confirm_password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <button
          className="auth-submit"
          type="submit"
          disabled={saving || success}
          aria-busy={saving}
        >
          {success
            ? "Password saved"
            : saving
              ? "Saving…"
              : "Continue to workspace"}
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
