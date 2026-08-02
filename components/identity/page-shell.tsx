import type { ReactNode } from "react";

export type IdentityPageShellWidth = "reading" | "working" | "full";

export type IdentityPageShellProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  /** @deprecated Prefer width="reading" */
  narrow?: boolean;
  width?: IdentityPageShellWidth;
  className?: string;
  children: ReactNode;
};

export function IdentityPageShell({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryActions,
  narrow = false,
  width,
  className = "",
  children,
}: IdentityPageShellProps) {
  const resolvedWidth: IdentityPageShellWidth =
    width ?? (narrow ? "reading" : "full");
  const hasHeader = Boolean(title || eyebrow || description || primaryAction || secondaryActions);

  return (
    <main className={`identity-page-shell ${className}`.trim()}>
      <div
        className="identity-page-container"
        data-width={resolvedWidth}
      >
        {hasHeader ? (
          <header className="identity-page-shell__header">
            <div className="identity-page-shell__copy">
              {eyebrow ? (
                <p className="identity-page-shell__eyebrow">{eyebrow}</p>
              ) : null}
              {title ? (
                <h1 className="identity-page-shell__title">{title}</h1>
              ) : null}
              {description ? (
                <p className="identity-page-shell__description">{description}</p>
              ) : null}
            </div>

            {primaryAction || secondaryActions ? (
              <div className="identity-page-shell__actions">
                {secondaryActions ? (
                  <div className="identity-page-shell__secondary">
                    {secondaryActions}
                  </div>
                ) : null}
                {primaryAction ? (
                  <div className="identity-page-shell__primary">
                    {primaryAction}
                  </div>
                ) : null}
              </div>
            ) : null}
          </header>
        ) : null}

        <div className="identity-page-shell__body">{children}</div>
      </div>
    </main>
  );
}
