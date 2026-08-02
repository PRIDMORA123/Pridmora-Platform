"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/organisation", label: "Overview", exact: true },
  { href: "/organisation/members", label: "Members" },
  { href: "/organisation/assignments", label: "Assignments" },
  { href: "/organisation/usage", label: "Usage" },
  { href: "/organisation/settings", label: "Settings" },
];

export function OrganisationNavigation() {
  const pathname = usePathname();

  return (
    <nav className="organisation-nav" aria-label="Organisation">
      <div className="organisation-nav__scroller">
        {NAV.map(item => {
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
