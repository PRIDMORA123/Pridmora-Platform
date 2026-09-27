"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCanManageSampleOrganisation } from "@/lib/organisations/use-can-manage-sample-organisation";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { hasPermission } from "@/lib/organisations/permissions";

const BASE_NAV: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/organisation", label: "Overview", exact: true },
  {
    href: "/organisation/manager-development",
    label: "Manager Development",
  },
  {
    href: "/organisation/intelligence",
    label: "People Development",
  },
  { href: "/organisation/members", label: "Members" },
  { href: "/organisation/assignments", label: "Assignments" },
  { href: "/organisation/usage", label: "Usage" },
  { href: "/organisation/settings", label: "Settings" },
];

export function OrganisationNavigation() {
  const pathname = usePathname();
  const organisation = useOrganisation();
  const showSample = useCanManageSampleOrganisation();
  const canManageGuidance =
    organisation?.role != null &&
    organisation.organisation.organisationGuidanceEnabled &&
    hasPermission(organisation.role, "organisation_guidance.manage");

  const organisationNav = canManageGuidance
    ? [
        ...BASE_NAV.slice(0, 3),
        { href: "/organisation/guidance", label: "Organisation Guidance" },
        ...BASE_NAV.slice(3),
      ]
    : BASE_NAV;

  const nav = showSample
    ? [
        ...organisationNav,
        { href: "/settings/sample-organisation", label: "Sample organisation" },
      ]
    : organisationNav;

  return (
    <nav className="organisation-nav" aria-label="Organisation">
      <div className="organisation-nav__scroller">
        {nav.map(item => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "organisation-nav__link is-active"
                  : "organisation-nav__link"
              }
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
