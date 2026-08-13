"use client";

export type MyDevelopmentSubnavSection =
  | "overview"
  | "reflection"
  | "evidence"
  | "intelligence";

/**
 * Shared My Development section navigation for Manager self-development views.
 */
export function MyDevelopmentSubnav({
  active,
  onOpenOverview,
  onOpenReflection,
  onOpenEvidence,
  onOpenIntelligence,
}: {
  active: MyDevelopmentSubnavSection;
  onOpenOverview: () => void;
  onOpenReflection: () => void;
  onOpenEvidence: () => void;
  onOpenIntelligence: () => void;
}) {
  return (
    <nav
      className="person-development-subnav"
      aria-label="My development sections"
    >
      {active === "overview" ? (
        <span className="person-development-subnav__item is-active">
          Overview
        </span>
      ) : (
        <button
          type="button"
          className="person-development-subnav__item"
          onClick={onOpenOverview}
        >
          Overview
        </button>
      )}
      {active === "reflection" ? (
        <span className="person-development-subnav__item is-active">
          Reflection
        </span>
      ) : (
        <button
          type="button"
          className="person-development-subnav__item"
          onClick={onOpenReflection}
        >
          Reflection
        </button>
      )}
      {active === "evidence" ? (
        <span className="person-development-subnav__item is-active">
          Evidence
        </span>
      ) : (
        <button
          type="button"
          className="person-development-subnav__item"
          onClick={onOpenEvidence}
        >
          Evidence
        </button>
      )}
      {active === "intelligence" ? (
        <span className="person-development-subnav__item is-active">
          Development Intelligence
        </span>
      ) : (
        <button
          type="button"
          className="person-development-subnav__item"
          onClick={onOpenIntelligence}
        >
          Development Intelligence
        </button>
      )}
    </nav>
  );
}
