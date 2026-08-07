import type { ReactNode } from "react";

export type SummarySectionProps = {
  title: string;
  purpose?: string;
  children: ReactNode;
};

export function SummarySection({ title, purpose, children }: SummarySectionProps) {
  return (
    <section className="summary-insights-section">
      <h2 className="summary-insights-section__title">{title}</h2>
      {purpose ? (
        <p className="summary-insights-section__purpose">{purpose}</p>
      ) : null}
      <div className="summary-insights-section__content">{children}</div>
    </section>
  );
}
