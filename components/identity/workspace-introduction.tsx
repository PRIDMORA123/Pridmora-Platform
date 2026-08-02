import type { ReactNode } from "react";

export type WorkspaceIntroductionProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  metadata?: ReactNode;
  className?: string;
};

export function WorkspaceIntroduction({
  eyebrow,
  title,
  description,
  metadata,
  className = "workspace-introduction",
}: WorkspaceIntroductionProps) {
  const prefix = className.trim() || "workspace-introduction";

  return (
    <header className={prefix}>
      <div>
        {eyebrow ? (
          <p className={`${prefix}-eyebrow`}>{eyebrow}</p>
        ) : null}

        <h2 className={`${prefix}-title`}>{title}</h2>

        {description ? (
          <p className={`${prefix}-description`}>{description}</p>
        ) : null}
      </div>

      {metadata ? (
        <div className={`${prefix}-meta`}>{metadata}</div>
      ) : null}
    </header>
  );
}
