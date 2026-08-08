"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/owner", label: "Overview", exact: true },
  { href: "/owner/organisations", label: "Organisations" },
  { href: "/owner/users", label: "Users" },
  { href: "/owner/commercial", label: "Commercial" },
  { href: "/owner/support", label: "Support" },
  { href: "/owner/health", label: "Platform Health" },
  { href: "/owner/audit", label: "Audit" },
  { href: "/owner/settings", label: "Settings" },
];

export function OwnerNavigation() {
  const pathname = usePathname();

  return (
    <nav className="owner-nav" aria-label="Owner Console">
      <div className="owner-nav__scroller">
        {NAV.map(item => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "owner-nav__link is-active" : "owner-nav__link"}
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
