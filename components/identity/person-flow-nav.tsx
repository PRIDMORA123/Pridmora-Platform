"use client";

import type { MouseEventHandler } from "react";
import { IdentityBackLink } from "@/components/identity/back-link";

type PersonFlowNavProps = {
  personName: string;
  stageLabel: string;
  onBackToPeople: () => void;
  onBackToPerson: () => void;
  className?: string;
};

/**
 * Breadcrumb: People › {PersonName} › {Stage}
 * People and person name are clickable; stage is the current page.
 */
export function PersonFlowBreadcrumb({
  personName,
  stageLabel,
  onBackToPeople,
  onBackToPerson,
  className,
}: PersonFlowNavProps) {
  return (
    <nav
      aria-label="Person context"
      className={["identity-person-flow-nav", className].filter(Boolean).join(" ")}
    >
      <ol className="identity-person-flow-nav__trail">
        <li>
          <button
            type="button"
            className="identity-person-flow-nav__link"
            onClick={onBackToPeople}
          >
            People
          </button>
        </li>
        <li aria-hidden="true" className="identity-person-flow-nav__sep">
          ›
        </li>
        <li>
          <button
            type="button"
            className="identity-person-flow-nav__link"
            onClick={onBackToPerson}
          >
            {personName}
          </button>
        </li>
        <li aria-hidden="true" className="identity-person-flow-nav__sep">
          ›
        </li>
        <li>
          <span className="identity-person-flow-nav__current" aria-current="page">
            {stageLabel}
          </span>
        </li>
      </ol>
    </nav>
  );
}

type PersonFlowBackLinkProps = {
  personName: string;
  onBack: MouseEventHandler<HTMLButtonElement>;
};

/** Compact back control: Back to {PersonName} */
export function PersonFlowBackLink({ personName, onBack }: PersonFlowBackLinkProps) {
  return (
    <IdentityBackLink onClick={onBack}>{`Back to ${personName}`}</IdentityBackLink>
  );
}
