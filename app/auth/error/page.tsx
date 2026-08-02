import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  const message =
    params.message?.trim() ||
    "Something went wrong with authentication. Please try signing in again.";

  return (
    <AuthShell
      eyebrow="AUTHENTICATION"
      title="Unable to continue"
      description={message}
      footer={
        <p className="auth-footer-links">
          <Link href="/auth/sign-in">Return to sign in</Link>
        </p>
      }
    >
      <p className="muted auth-helper">
        If you followed an email link, it may have expired. You can request a new verification or
        password reset email from the sign-in screens.
      </p>
    </AuthShell>
  );
}
