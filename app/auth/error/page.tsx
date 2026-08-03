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
    "The link may have expired or already been used. Return to sign in and try again.";

  return (
    <AuthShell
      eyebrow="WE COULDN’T CONTINUE"
      title="There was a problem with this link."
      description={message}
      footer={
        <p className="auth-account-prompt">
          <Link href="/auth/sign-in">Return to sign in</Link>
        </p>
      }
    >
      <p className="auth-helper">
        If you followed an email link, it may have expired. You can request a new verification or
        password reset email from the sign-in screens.
      </p>
    </AuthShell>
  );
}
