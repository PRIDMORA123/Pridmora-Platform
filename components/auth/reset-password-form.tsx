"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPasswordField } from "@/components/auth/auth-fields";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;

        if (sessionError || !data.session) {
          setExpired(true);
          setReady(true);
          return;
        }

        setReady(true);
      } catch {
        if (!cancelled) {
          setExpired(true);
          setReady(true);
        }
      }
    }

    void verifySession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || expired) return;
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
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        const message = updateError.message.toLowerCase();
        if (message.includes("expired") || message.includes("session")) {
          setExpired(true);
          setError("This reset link has expired. Request a new password reset email.");
        } else {
          setError("Unable to update your password. Please try again.");
        }
        return;
      }

      setSuccess(true);
      window.setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 1200);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <AuthShell eyebrow="CREATE A NEW PASSWORD" title="Preparing secure reset…">
        <p className="auth-form__description">Checking your reset link…</p>
      </AuthShell>
    );
  }

  if (expired) {
    return (
      <AuthShell
        eyebrow="CREATE A NEW PASSWORD"
        title="This link is no longer valid"
        description="Password reset links expire for security. Request a new link to continue."
        footer={
          <p className="auth-account-prompt">
            <Link href="/auth/forgot-password">Request a new reset link</Link>
            {" · "}
            <Link href="/auth/sign-in">Sign in</Link>
          </p>
        }
      >
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
      eyebrow="CREATE A NEW PASSWORD"
      title="Choose a new password."
      description="Set a secure password to return to your workspace."
      footer={
        <p className="auth-account-prompt">
          <Link href="/auth/sign-in">Return to sign in</Link>
        </p>
      }
    >
      <form
        className="auth-form-fields"
        onSubmit={event => {
          void submit(event);
        }}
      >
        <AuthPasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <AuthPasswordField
          label="Confirm new password"
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
          {success ? "Password updated" : saving ? "Updating…" : "Update password"}
        </button>
        {error ? (
          <p className="inline-notice error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="inline-notice" role="status">
            Password updated. Taking you to your workspace…
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
