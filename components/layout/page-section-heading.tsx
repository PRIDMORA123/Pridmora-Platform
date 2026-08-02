import type { ReactNode } from "react";

type PageSectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  as?: "h1" | "h2";
};

export function PageSectionHeading({
  eyebrow,
  title,
  description,
  actions,
  as = "h2",
}: PageSectionHeadingProps) {
  const HeadingTag = as;

  return (
    <header className="identity-section-heading">
      <div>
        {eyebrow ? (
          <p className="identity-section-heading__eyebrow">{eyebrow}</p>
        ) : null}

        <HeadingTag>{title}</HeadingTag>

        {description ? (
          <p className="identity-section-heading__description">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="identity-section-heading__actions">{actions}</div>
      ) : null}
    </header>
  );
}
