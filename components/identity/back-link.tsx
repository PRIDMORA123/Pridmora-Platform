import type { MouseEventHandler, ReactNode } from "react";

type IdentityBackLinkProps = {
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

/**
 * Contextual back control. Prefer `onClick` for in-app navigation
 * (unsaved-changes guards); use `href` for ordinary links.
 */
export function IdentityBackLink({
  href,
  onClick,
  children,
}: IdentityBackLinkProps) {
  if (onClick) {
    return (
      <button type="button" className="identity-back-link" onClick={onClick}>
        <span aria-hidden="true">←</span>
        <span>{children}</span>
      </button>
    );
  }

  return (
    <a href={href ?? "#"} className="identity-back-link">
      <span aria-hidden="true">←</span>
      <span>{children}</span>
    </a>
  );
}
