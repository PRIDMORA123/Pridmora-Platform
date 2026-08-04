"use client";

import type { ReactNode } from "react";
import { OrganisationHeader } from "@/components/organisation/organisation-header";
import { OrganisationNavigation } from "@/components/organisation/organisation-navigation";

export function OrganisationShell({
  title,
  subtitle,
  eyebrow,
  compactHeader = false,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  compactHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        compactHeader
          ? "organisation-workspace organisation-workspace--compact-header"
          : "organisation-workspace"
      }
    >
      <OrganisationHeader title={title} subtitle={subtitle} eyebrow={eyebrow} />
      <OrganisationNavigation />
      <div className="organisation-workspace__content">{children}</div>
    </div>
  );
}
