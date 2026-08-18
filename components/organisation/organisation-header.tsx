"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/account-menu";
import { WorkspaceSelector } from "@/components/organisation/workspace-selector";
import { apiJson } from "@/lib/api-client";
import { LEAD_WORKSPACE_PATH } from "@/lib/auth/post-login-destination";
import { signOutToSignIn } from "@/lib/auth/sign-out-client";
import { initialsFromFullName } from "@/lib/auth/session-client";
import { useOrganisation } from "@/lib/organisations/organisation-context";
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
 * Multi-membership users get the same WorkspaceSelector as Manager AppShell.
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
  const organisation = useOrganisation();
  const membershipRole = organisation?.role ?? null;
  const [accountName, setAccountName] = useState("Account");
  const [accountTitle, setAccountTitle] = useState("Account");
  const [accountInitials, setAccountInitials] = useState("?");

  const isOversight = membershipRole === "oversight";
  const backHref = isOversight ? LEAD_WORKSPACE_PATH : "/?view=dashboard";
  const backLabel = isOversight
    ? "Organisation overview"
    : "Back to workspace";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profilePayload = await apiJson<{
          profile?: { fullName?: string; professionalTitle?: string | null };
        }>("/api/profile");
        if (cancelled) return;

        const fullName = profilePayload.profile?.fullName?.trim() || "Account";
        setAccountName(fullName);
        setAccountInitials(initialsFromFullName(fullName));
        setAccountTitle(accountTitleForMembership(membershipRole));
      } catch {
        // Account menu still renders with placeholders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [membershipRole]);

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
        {organisation?.showWorkspaceSelector ? (
          <div className="organisation-header__workspace">
            <WorkspaceSelector />
          </div>
        ) : null}
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
