"use client";

import type { ReactNode } from "react";
import { IdentityProductMark } from "@/components/identity/product-mark";
import { BRAND } from "@/lib/brand";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="login-shell">
      <section className="brand-panel">
        <div className="identity-auth-mark">
          <IdentityProductMark variant="full" />
        </div>
        <div>
          <p className="brand-copy">{BRAND.productDescriptor}</p>
        </div>
        <p className="small light">
          Evidence before certainty. AI proposes. Professional judgement remains
          human.
        </p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {description ? <p className="muted">{description}</p> : null}
          {children}
          {footer}
        </div>
      </section>
    </main>
  );
}
