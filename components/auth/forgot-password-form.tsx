"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthTextField } from "@/components/auth/auth-fields";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setStatus("idle");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();

    try {
      const supabase = createBrowserSupabaseClient();
      const origin = window.location.origin;
      // Always show the same success copy — do not reveal whether the email exists.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
      });

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
      <form
        className="auth-form-fields"
        onSubmit={event => {
          void submit(event);
        }}
      >
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
