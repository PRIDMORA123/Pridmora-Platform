import { Suspense } from "react";
import { CheckEmailPanel } from "@/components/auth/check-email-panel";

export default function CheckEmailPage() {
  return (
    <Suspense fallback={<main className="login-shell"><section className="login-panel"><p className="muted">Loading…</p></section></main>}>
      <CheckEmailPanel />
    </Suspense>
  );
}
