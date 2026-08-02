"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SignUpForm() {
  const router = useRouter();
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
      const origin = window.location.origin;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=/`,
          data: {
            full_name: fullName,
            professional_title: professionalTitle || "Professional Coach",
            organisation: organisation || null,
          },
        },
      });

      if (signUpError) {
        setError(
          signUpError.message.toLowerCase().includes("already")
            ? "Unable to create this account. Try signing in, or use a different email address."
            : "Unable to create your account. Please check your details and try again."
        );
        return;
      }

      // If email confirmation is required, there may be no session yet.
      if (!data.session) {
        router.push(`/auth/check-email?email=${encodeURIComponent(email)}`);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AuthShell
      eyebrow="CREATE ACCOUNT"
      title="Start your coaching workspace"
      description="Create a secure coach account. You may need to verify your email before signing in."
      footer={
        <p className="auth-footer-links">
          Already have an account? <Link href="/auth/sign-in">Sign in</Link>
        </p>
      }
    >
      <form
        onSubmit={event => {
          void submit(event);
        }}
      >
        <label>
          Full name
          <input type="text" name="full_name" autoComplete="name" required />
        </label>
        <label>
          Professional title
          <input
            type="text"
            name="professional_title"
            autoComplete="organization-title"
            placeholder="Professional Coach"
            required
          />
        </label>
        <label>
          Organisation <span className="optional">(optional)</span>
          <input type="text" name="organisation" autoComplete="organization" />
        </label>
        <label>
          Email address
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button className="primary full" type="submit" disabled={creating} aria-busy={creating}>
          {creating ? "Creating account..." : "Create account"}{" "}
          {!creating && <ArrowRight size={18} />}
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
