import type { ReactNode } from "react";

export type IdentityPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
};

export function IdentityPageHeader({
  eyebrow,
  title,
  description,
  action,
  primaryAction,
  secondaryActions,
}: IdentityPageHeaderProps) {
  const resolvedPrimary = primaryAction ?? action;

  return (
    <header className="identity-general-page-header identity-page-shell__header">
      <div className="identity-page-shell__copy">
        {eyebrow ? (
          <p className="identity-page-shell__eyebrow home-eyebrow">{eyebrow}</p>
        ) : null}

        <h1 className="identity-page-title identity-page-shell__title">
          {title}
        </h1>

        {description ? (
          <p className="identity-general-page-description identity-page-shell__description">
            {description}
          </p>
        ) : null}
      </div>

      {resolvedPrimary || secondaryActions ? (
        <div className="identity-general-page-action identity-page-shell__actions">
          {secondaryActions}
          {resolvedPrimary}
        </div>
      ) : null}
    </header>
  );
}
