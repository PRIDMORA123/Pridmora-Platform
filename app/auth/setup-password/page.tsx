import { Suspense } from "react";
import { SetupPasswordForm } from "@/components/auth/setup-password-form";

export default function SetupPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-layout">
          <section className="auth-form-panel">
            <p className="muted">Loading…</p>
          </section>
        </main>
      }
    >
      <SetupPasswordForm />
    </Suspense>
  );
}
