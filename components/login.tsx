"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy demo login — redirects to Supabase Auth sign-in. */
export function Login({ onSignIn: _onSignIn }: { onSignIn?: () => void }) {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/sign-in");
  }, [router]);

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Development Intelligence Platform</p>
          <h2>Redirecting to sign in…</h2>
          <p className="muted">Secure authentication is required.</p>
        </div>
      </section>
    </main>
  );
}
