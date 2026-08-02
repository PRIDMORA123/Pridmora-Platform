"use client";

import Link from "next/link";

export function OrganisationHeader({
  title,
  subtitle,
  eyebrow = "Organisation workspace",
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}) {
  return (
    <header className="organisation-header">
      <div className="organisation-header__main">
        <p className="organisation-header__eyebrow">{eyebrow}</p>
        <h1 className="organisation-header__title">{title}</h1>
        {subtitle ? (
          <p className="organisation-header__subtitle">{subtitle}</p>
        ) : null}
      </div>
      <Link href="/?view=dashboard" className="organisation-header__back">
        Back to workspace
      </Link>
    </header>
  );
}
