import type { ReactNode } from "react";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { AuthFormLayout } from "@/components/auth/auth-form-layout";

/**
 * Shared authentication composition: brand experience + form panel.
 * Replaces the previous card-based split layout.
 */
export function AuthShell({
  eyebrow,
  title,
  description,
  supporting,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  supporting?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="auth-layout">
      <AuthBrandPanel />
      <AuthFormLayout
        eyebrow={eyebrow}
        title={title}
        description={description}
        supporting={supporting}
        footer={footer}
      >
        {children}
      </AuthFormLayout>
    </main>
  );
}
