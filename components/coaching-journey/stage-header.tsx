import type { ReactNode } from "react";

export type StageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  optional?: boolean;
  metadata?: ReactNode;
};

/**
 * Single vertical stage header — eyebrow, title, description.
 * Do not place these fields in separate columns.
 */
export function StageHeader({
  eyebrow,
  title,
  description,
  optional = false,
  metadata,
}: StageHeaderProps) {
  return (
    <header className="identity-stage-header">
      {metadata ? (
        <div className="identity-stage-header__metadata">{metadata}</div>
      ) : null}

      <div className="identity-stage-header__content">
        <div className="identity-stage-header__eyebrow-row">
          <p className="identity-stage-header__eyebrow">{eyebrow}</p>
          {optional ? (
            <span className="identity-stage-header__optional">Optional</span>
          ) : null}
        </div>

        <h1 className="identity-stage-header__title">{title}</h1>

        {description ? (
          <p className="identity-stage-header__description">{description}</p>
        ) : null}
      </div>
    </header>
  );
}
