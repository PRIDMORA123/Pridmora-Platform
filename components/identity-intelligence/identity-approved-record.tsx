import type { ReactNode } from "react";

export type IdentityApprovedRecordProps = {
  title?: string;
  approvedBy?: string;
  approvedAt?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function IdentityApprovedRecord({
  title,
  approvedBy,
  approvedAt,
  children,
  actions,
  className = "",
}: IdentityApprovedRecordProps) {
  const metaParts = [
    approvedBy ? `Approved by ${approvedBy}` : null,
    approvedAt ?? null,
  ].filter(Boolean);

  return (
    <article
      className={`identity-approved-record ${className}`.trim()}
      aria-label={title ?? "Approved coaching record"}
    >
      <header className="identity-approved-record__header">
        <div>
          <p className="identity-approved-record__label">
            Approved coaching record
          </p>
          {metaParts.length ? (
            <p className="identity-approved-record__meta">
              {metaParts.join(" · ")}
            </p>
          ) : null}
          {title ? (
            <h3 className="identity-approved-record__title">{title}</h3>
          ) : null}
        </div>
        {actions}
      </header>
      <div className="identity-approved-record__body">{children}</div>
    </article>
  );
}
