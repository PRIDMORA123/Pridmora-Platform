import type { ReactNode } from "react";

export type CoachContentKind =
  | "notes"
  | "private-reminder"
  | "reflection"
  | "manager-note";

const KIND_LABELS: Record<CoachContentKind, string> = {
  notes: "Your notes",
  "private-reminder": "Private reminder",
  reflection: "Coach reflection",
  "manager-note": "Manager note",
};

export type IdentityCoachContentProps = {
  kind?: CoachContentKind;
  label?: string;
  privateVisibleOnlyToYou?: boolean;
  children: ReactNode;
  className?: string;
};

export function IdentityCoachContent({
  kind = "notes",
  label,
  privateVisibleOnlyToYou = false,
  children,
  className = "",
}: IdentityCoachContentProps) {
  const resolvedLabel = label ?? KIND_LABELS[kind];
  const isPrivate =
    privateVisibleOnlyToYou || kind === "private-reminder";

  return (
    <section
      className={`identity-coach-content ${className}`.trim()}
      aria-label={resolvedLabel}
    >
      <header>
        <p className="identity-coach-content__label">{resolvedLabel}</p>
        {isPrivate ? (
          <p className="identity-coach-content__privacy">
            Private · Visible only to you
          </p>
        ) : null}
      </header>
      <div className="identity-coach-content__body">{children}</div>
    </section>
  );
}
