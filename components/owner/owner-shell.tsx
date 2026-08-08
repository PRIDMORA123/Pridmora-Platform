"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { OwnerNavigation } from "@/components/owner/owner-navigation";

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
        <Link href="/?view=dashboard" className="owner-shell__exit">
          Exit to workspace
        </Link>
      </div>
      <OwnerNavigation />
      <div className="owner-shell__content">{children}</div>
    </div>
  );
}
