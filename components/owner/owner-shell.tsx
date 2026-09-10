"use client";

import type { ReactNode } from "react";
import { OwnerNavigation } from "@/components/owner/owner-navigation";
import { signOutToSignIn } from "@/lib/auth/sign-out-client";

export function OwnerShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="owner-shell">
      <div className="owner-shell__top">
        <div className="owner-shell__brand">
          <p className="owner-shell__brand-mark">Pridmora</p>
          <h1 className="owner-shell__title">{title}</h1>
          {subtitle ? <p className="owner-shell__subtitle">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          className="owner-shell__sign-out"
          onClick={() => {
            void signOutToSignIn();
          }}
        >
          Sign out
        </button>
      </div>
      <OwnerNavigation />
      <div className="owner-shell__content">{children}</div>
    </div>
  );
}
