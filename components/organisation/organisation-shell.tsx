"use client";

import type { ReactNode } from "react";
import { OrganisationHeader } from "@/components/organisation/organisation-header";
import { OrganisationNavigation } from "@/components/organisation/organisation-navigation";

export function OrganisationShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="organisation-workspace">
      <OrganisationHeader title={title} subtitle={subtitle} />
      <OrganisationNavigation />
      <div className="organisation-workspace__content">{children}</div>
    </div>
  );
}
