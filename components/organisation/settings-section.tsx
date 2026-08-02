import type { ReactNode } from "react";

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="organisation-settings-section">
      <header className="organisation-settings-section__header">
        <h2 className="organisation-section-title">{title}</h2>
        {description ? (
          <p className="organisation-muted">{description}</p>
        ) : null}
      </header>
      <div className="organisation-settings-section__body">{children}</div>
    </section>
  );
}
