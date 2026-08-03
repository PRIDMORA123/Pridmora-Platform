"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";

export function CheckEmailPanel() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  return (
    <AuthShell
      eyebrow="CHECK YOUR EMAIL"
      title="Verify your account."
      description={
        email
          ? `We’ve sent a secure verification link to ${email}.`
          : "We’ve sent a secure verification link to your email address."
      }
      footer={
        <p className="auth-account-prompt">
          <Link href="/auth/sign-in">Return to sign in</Link>
        </p>
      }
    >
      <p className="auth-helper">
        If you do not see the email, check your spam folder. The coaching workspace stays locked
        until verification is complete.
      </p>
    </AuthShell>
  );
}
