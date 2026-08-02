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
      title="Verify your email to continue"
      description={
        email
          ? `We sent a verification link to ${email}. Open the link to activate your account, then sign in.`
          : "We sent a verification link to your email address. Open the link to activate your account, then sign in."
      }
      footer={
        <p className="auth-footer-links">
          <Link href="/auth/sign-in">Return to sign in</Link>
        </p>
      }
    >
      <p className="muted auth-helper">
        If you do not see the email, check your spam folder. The coaching workspace stays locked
        until verification is complete.
      </p>
    </AuthShell>
  );
}
