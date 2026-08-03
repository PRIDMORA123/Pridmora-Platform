import { Suspense } from "react";
import { CheckEmailPanel } from "@/components/auth/check-email-panel";

export default function CheckEmailPage() {
  return (
    <Suspense fallback={<main className="auth-layout"><section className="auth-form-panel"><p className="muted">Loading…</p></section></main>}>
      <CheckEmailPanel />
    </Suspense>
  );
}
