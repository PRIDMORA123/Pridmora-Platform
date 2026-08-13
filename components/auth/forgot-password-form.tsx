"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthTextField } from "@/components/auth/auth-fields";
import {
  logAuthClientDiagnostic,
  mapAuthClientError,
} from "@/lib/auth/client-errors";
import {
  buildPasswordRecoveryRedirectTo,
  resolveAuthSiteOrigin,
} from "@/lib/auth/recovery";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // React 19 function form action: React calls preventDefault and never
  // navigates to a URL (avoids native POST/GET to /auth/sign-in when JS
  // onSubmit does not attach or document URL is still sign-in).
  async function submitAction(formData: FormData) {
    if (submitting) return;
    setSubmitting(true);
    setStatus("idle");
    setMessage("");

    const email = String(formData.get("email") || "").trim();

    try {
      const supabase = createBrowserSupabaseClient();
      const siteOrigin = resolveAuthSiteOrigin(window.location.origin);
      // Success copy stays enumeration-safe. Auth API errors must not look like success.
      // redirectTo is the password-change page; email template adds token_hash + type.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildPasswordRecoveryRedirectTo(siteOrigin),
      });

      if (error) {
        const mapped = mapAuthClientError(error, "forgot_password");
        logAuthClientDiagnostic("forgot_password", mapped, error);
        setStatus("error");
        setMessage(mapped.userMessage);
        return;
      }

      setStatus("sent");
      setMessage(
        "If an account exists for that email, you will receive a password reset link shortly."
      );
    } catch {
      setStatus("error");
      setMessage("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="ACCOUNT RECOVERY"
      title="Reset your password."
      description="Enter your email address and we’ll send you a secure reset link."
      footer={
        <p className="auth-account-prompt">
          <Link href="/auth/sign-in">Return to sign in</Link>
        </p>
      }
    >
      <form className="auth-form-fields" action={submitAction}>
        <AuthTextField
          label="Email address"
          icon="email"
          type="email"
          name="email"
          autoComplete="email"
          required
        />
        <button className="auth-submit" type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
        {message ? (
          <p
            className={`inline-notice ${status === "error" ? "error" : ""}`}
            role={status === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
