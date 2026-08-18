"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LEAD_WORKSPACE_PATH } from "@/lib/auth/post-login-destination";
import { apiJson } from "@/lib/api-client";
import type { MembershipRole } from "@/lib/organisations/types";

/**
 * Organisation workspace header.
 * Oversight Leads must stay in /organisation — do not send them to Manager home.
 */
export function OrganisationHeader({
  title,
  subtitle,
  eyebrow = "Organisation workspace",
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}) {
  const [backHref, setBackHref] = useState("/?view=dashboard");
  const [backLabel, setBackLabel] = useState("Back to workspace");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await apiJson<{
          current?: { role?: MembershipRole };
        }>("/api/organisations/current");
        if (cancelled) return;
        if (payload.current?.role === "oversight") {
          setBackHref(LEAD_WORKSPACE_PATH);
          setBackLabel("Organisation overview");
        }
      } catch {
        // Keep Manager-home fallback when org context is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="organisation-header">
      <div className="organisation-header__main">
        <p className="organisation-header__eyebrow">{eyebrow}</p>
        <h1 className="organisation-header__title">{title}</h1>
        {subtitle ? (
          <p className="organisation-header__subtitle">{subtitle}</p>
        ) : null}
      </div>
      <Link href={backHref} className="organisation-header__back">
        {backLabel}
      </Link>
    </header>
  );
}
