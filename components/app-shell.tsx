"use client";

import { Building2, Home, Users, LogOut, Menu, X, Plus, Settings } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { IdentityButton } from "@/components/identity/button";
import { IdentityProductMark } from "@/components/identity/product-mark";
import { WorkspaceSelector } from "@/components/organisation/workspace-selector";
import { BRAND } from "@/lib/brand";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { useCanManageSampleOrganisation } from "@/lib/organisations/use-can-manage-sample-organisation";

export type AppView =
  | "today"
  | "dashboard"
  | "clients"
  | "people"
  | "sessions"
  | "global-intelligence"
  | "settings"
  | "coach-space"
  | "prepare"
  | "session"
  | "intelligence"
  | "development-update"
  | "person-actions"
  | "journey"
  | "career-journey"
  | "coaching-report"
  | "reports";

type Props = {
  view: AppView;
  onNavigate: (view: AppView) => void;
  onNewClient: () => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  creatingClient?: boolean;
  coachName: string;
  coachTitle: string;
  coachInitials: string;
  children: ReactNode;
};

const PEOPLE_FLOW_VIEWS: AppView[] = [
  "clients",
  "people",
  "coach-space",
  "prepare",
  "session",
  "intelligence",
  "development-update",
  "person-actions",
  "journey",
  "career-journey",
  "coaching-report",
  "reports",
];

export function AppShell({
  view,
  onNavigate,
  onNewClient,
  onSignOut,
  mobileOpen,
  setMobileOpen,
  creatingClient = false,
  coachName,
  coachTitle,
  coachInitials,
  children,
}: Props) {
  const organisation = useOrganisation();
  const showSampleOrganisation = useCanManageSampleOrganisation();
  const items = [
    { key: "dashboard" as const, label: "Home", icon: Home },
    { key: "people" as const, label: "People", icon: Users },
    { key: "settings" as const, label: "Settings", icon: Settings },
  ];

  useEffect(() => {
    if (!mobileOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, setMobileOpen]);

  function isNavActive(key: (typeof items)[number]["key"]) {
    if (key === "dashboard") return view === "dashboard" || view === "today";
    if (key === "people") return PEOPLE_FLOW_VIEWS.includes(view);
    if (key === "settings") return view === "settings";
    return false;
  }

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`sidebar identity-sidebar identity-mobile-navigation ${mobileOpen ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-top identity-sidebar-brand">
          <button
            type="button"
            className="brand-button identity-sidebar-logo"
            onClick={() => onNavigate("dashboard")}
            aria-label={`${BRAND.productShortName} home`}
          >
            <IdentityProductMark />
          </button>
          <button
            type="button"
            className="mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>

        <nav>
          {items.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={
                isNavActive(key)
                  ? "identity-nav-link identity-sidebar-nav-item is-active nav-active"
                  : "identity-nav-link identity-sidebar-nav-item"
              }
              aria-current={isNavActive(key) ? "page" : undefined}
              onClick={() => {
                onNavigate(key);
                setMobileOpen(false);
              }}
            >
              <Icon size={18} aria-hidden /> {label}
            </button>
          ))}
          {organisation?.showOrganisationNav ? (
            <a
              href="/organisation"
              className="identity-nav-link identity-sidebar-nav-item"
              onClick={() => setMobileOpen(false)}
            >
              <Building2 size={18} aria-hidden /> Organisation
            </a>
          ) : null}
          {showSampleOrganisation ? (
            <a
              href="/settings/sample-organisation"
              className="identity-nav-link identity-sidebar-nav-item"
              onClick={() => setMobileOpen(false)}
            >
              <Building2 size={18} aria-hidden /> Sample organisation
            </a>
          ) : null}
        </nav>

        <a
          href="/professional-principles"
          className="identity-sidebar-principle"
        >
          <strong>Evidence before certainty</strong>
          <span>Insights remain proposed until reviewed.</span>
          <small>Professional principles</small>
        </a>

        <div className="sidebar-footer identity-sidebar-account">
          <div className="coach-mini">
            <span className="identity-sidebar-avatar">{coachInitials}</span>
            <div>
              <strong className="identity-sidebar-account-name">{coachName}</strong>
              <small className="identity-sidebar-account-role">{coachTitle}</small>
            </div>
          </div>
          <button
            type="button"
            className="identity-nav-link identity-sidebar-sign-out"
            onClick={() => {
              onSignOut();
            }}
          >
            <LogOut size={18} aria-hidden /> Sign out
          </button>
        </div>
      </aside>

      <div className="main identity-main-content">
        <header
          className={
            view === "dashboard" || view === "today"
              ? "application-topbar identity-topbar identity-topbar--home"
              : "application-topbar identity-topbar"
          }
        >
          <button
            type="button"
            className="mobile-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <Menu />
          </button>
          <div className="identity-topbar-workspace">
            <WorkspaceSelector />
          </div>
          <div className="application-topbar-actions">
            {view === "dashboard" || view === "today" ? null : (
              <IdentityButton
                variant="secondary"
                size="md"
                onClick={() => {
                  onNewClient();
                }}
                disabled={creatingClient}
                aria-busy={creatingClient}
              >
                <Plus size={17} aria-hidden /> New person
              </IdentityButton>
            )}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
