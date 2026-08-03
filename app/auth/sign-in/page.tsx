import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="auth-layout"><section className="auth-form-panel"><p className="muted">Loading…</p></section></main>}>
      <SignInForm />
    </Suspense>
  );
}
