"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPasswordField } from "@/components/auth/auth-fields";
import {
  logAuthClientDiagnostic,
  mapAuthClientError,
} from "@/lib/auth/client-errors";
import { PASSWORD_RESET_PATH } from "@/lib/auth/recovery";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type Phase =
  | "loading"
  | "awaiting_continue"
  | "verifying"
  | "ready"
  | "expired"
  | "missing";

function readRecoveryParams(): {
  code: string | null;
  type: string | null;
  tokenHash: string | null;
} {
  const search = new URLSearchParams(window.location.search);
  return {
    code: search.get("code"),
    type: search.get("type"),
    tokenHash: search.get("token_hash"),
  };
}

function clearRecoveryParamsFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  url.searchParams.delete("code");
  window.history.replaceState({}, "", url.pathname + (url.search || ""));
}

export function ResetPasswordForm() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function bootstrap() {
      try {
        const { code, type, tokenHash: hash } = readRecoveryParams();

        // Legacy PKCE recovery still completes via server callback.
        if (code) {
          const callback = new URL("/auth/callback", window.location.origin);
          callback.searchParams.set("code", code);
          callback.searchParams.set("next", PASSWORD_RESET_PATH);
          if (type) callback.searchParams.set("type", type);
          else callback.searchParams.set("type", "recovery");
          window.location.replace(callback.toString());
          return;
        }

        // Scanner-safe path: keep token_hash on this page and do NOT verify on GET.
        if (hash && (type === "recovery" || !type)) {
          if (!cancelled) {
            setTokenHash(hash);
            setPhase("awaiting_continue");
          }
          return;
        }

        const supabase = createBrowserSupabaseClient();
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(event => {
          if (cancelled) return;
          if (event === "PASSWORD_RECOVERY") {
            setError("");
            setPhase("ready");
          }
        });
        unsubscribe = () => subscription.unsubscribe();

        const { data, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;

        if (userError || !data.user) {
          setPhase("missing");
          return;
        }

        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("expired");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function continueWithToken() {
    if (!tokenHash || phase === "verifying") return;
    setError("");
    setPhase("verifying");

    try {
      const supabase = createBrowserSupabaseClient();
      // Explicit user action only — never verify on page load / GET.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });

      if (verifyError) {
        const mapped = mapAuthClientError(verifyError, "verify_recovery");
        logAuthClientDiagnostic("verify_recovery", mapped, verifyError);
        setError(mapped.userMessage);
        setPhase("expired");
        return;
      }

      clearRecoveryParamsFromUrl();
      setTokenHash(null);
      setPhase("ready");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setPhase("expired");
    }
  }

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
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        const mapped = mapAuthClientError(updateError, "reset_password");
        logAuthClientDiagnostic("reset_password", mapped, updateError);
        if (
          mapped.kind === "reset_link_invalid" ||
          mapped.kind === "recovery_session_unavailable"
        ) {
          setPhase("expired");
        }
        setError(mapped.userMessage);
        return;
      }

      // Only claim success after Supabase confirms the password write.
      setSuccess(true);
      await supabase.auth.signOut();
      window.setTimeout(() => {
        window.location.assign("/auth/sign-in");
      }, 1200);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "loading" || phase === "verifying") {
    return (
      <AuthShell eyebrow="CREATE A NEW PASSWORD" title="Preparing secure reset…">
        <p className="auth-form__description">
          {phase === "verifying" ? "Confirming your reset link…" : "Checking your reset link…"}
        </p>
      </AuthShell>
    );
  }

  if (phase === "awaiting_continue") {
    return (
      <AuthShell
        eyebrow="CREATE A NEW PASSWORD"
        title="Confirm password reset"
        description="For security, confirm that you want to reset your password. This step must be completed by you — not by an automatic email scan."
        footer={
          <p className="auth-account-prompt">
            <Link href="/auth/forgot-password">Request a new reset link</Link>
            {" · "}
            <Link href="/auth/sign-in">Sign in</Link>
          </p>
        }
      >
        <div className="auth-form-fields">
          <button
            className="auth-submit"
            type="button"
            onClick={() => {
              void continueWithToken();
            }}
          >
            Continue to reset password
          </button>
          {error ? (
            <p className="inline-notice error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </AuthShell>
    );
  }

  if (phase === "expired" || phase === "missing") {
    return (
      <AuthShell
        eyebrow="CREATE A NEW PASSWORD"
        title="This link is no longer valid"
        description={
          phase === "missing"
            ? "This reset page is missing a valid reset token. Request a new password reset email to continue."
            : "Password reset links expire for security, or may already have been used. Request a new link to continue."
        }
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
