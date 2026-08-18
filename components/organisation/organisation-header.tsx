"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/account-menu";
import { apiJson } from "@/lib/api-client";
import { LEAD_WORKSPACE_PATH } from "@/lib/auth/post-login-destination";
import { signOutToSignIn } from "@/lib/auth/sign-out-client";
import { initialsFromFullName } from "@/lib/auth/session-client";
import { MEMBERSHIP_ROLE_LABELS } from "@/lib/organisations/types";
import type { MembershipRole } from "@/lib/organisations/types";

function accountTitleForMembership(role: MembershipRole | null): string {
  if (role === "oversight") return "Organisation Lead";
  if (role && MEMBERSHIP_ROLE_LABELS[role]) {
    return MEMBERSHIP_ROLE_LABELS[role];
  }
  return "Account";
}

/**
 * Organisation workspace header.
 * Oversight Leads must stay in /organisation — do not send them to Manager home.
 * Account menu reuses Manager Sign out (Supabase session → /auth/sign-in).
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
  const [accountName, setAccountName] = useState("Account");
  const [accountTitle, setAccountTitle] = useState("Account");
  const [accountInitials, setAccountInitials] = useState("?");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [orgPayload, profilePayload] = await Promise.all([
          apiJson<{
            current?: { role?: MembershipRole };
          }>("/api/organisations/current"),
          apiJson<{
            profile?: { fullName?: string; professionalTitle?: string | null };
          }>("/api/profile"),
        ]);
        if (cancelled) return;

        const role = orgPayload.current?.role ?? null;
        if (role === "oversight") {
          setBackHref(LEAD_WORKSPACE_PATH);
          setBackLabel("Organisation overview");
        }

        const fullName = profilePayload.profile?.fullName?.trim() || "Account";
        setAccountName(fullName);
        setAccountInitials(initialsFromFullName(fullName));
        setAccountTitle(accountTitleForMembership(role));
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
      <div className="organisation-header__actions">
        <Link href={backHref} className="organisation-header__back">
          {backLabel}
        </Link>
        <div className="organisation-header__account">
          <AccountMenu
            coachName={accountName}
            coachTitle={accountTitle}
            coachInitials={accountInitials}
            menuPlacement="below"
            onOpenSettings={() => {
              window.location.assign("/organisation/settings");
            }}
            onSignOut={() => {
              void signOutToSignIn();
            }}
          />
        </div>
      </div>
    </header>
  );
}
