"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPasswordField } from "@/components/auth/auth-fields";
import { PASSWORD_RESET_PATH } from "@/lib/auth/recovery";
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
    let unsubscribe: (() => void) | undefined;

    async function verifySession() {
      try {
        const search = new URLSearchParams(window.location.search);
        const code = search.get("code");
        const type = search.get("type");
        const tokenHash = search.get("token_hash");

        // If the recovery email redirected straight here with a PKCE code,
        // complete exchange via the server callback (sets cookies correctly).
        if (code) {
          const callback = new URL("/auth/callback", window.location.origin);
          callback.searchParams.set("code", code);
          callback.searchParams.set("next", PASSWORD_RESET_PATH);
          if (type) callback.searchParams.set("type", type);
          else callback.searchParams.set("type", "recovery");
          window.location.replace(callback.toString());
          return;
        }

        // Token-hash recovery links should complete via /auth/confirm.
        if (tokenHash && type === "recovery") {
          const confirm = new URL("/auth/confirm", window.location.origin);
          confirm.searchParams.set("token_hash", tokenHash);
          confirm.searchParams.set("type", "recovery");
          confirm.searchParams.set("next", PASSWORD_RESET_PATH);
          window.location.replace(confirm.toString());
          return;
        }

        const supabase = createBrowserSupabaseClient();
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(event => {
          if (cancelled) return;
          if (event === "PASSWORD_RECOVERY") {
            setExpired(false);
            setReady(true);
          }
        });
        unsubscribe = () => subscription.unsubscribe();

        const { data, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;

        if (userError || !data.user) {
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
      unsubscribe?.();
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
      await supabase.auth.signOut();
      window.setTimeout(() => {
        router.replace("/auth/sign-in");
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
            Password updated. Taking you to sign in…
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
