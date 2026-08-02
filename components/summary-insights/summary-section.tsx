import type { ReactNode } from "react";

export type SummarySectionProps = {
  title: string;
  children: ReactNode;
};

export function SummarySection({ title, children }: SummarySectionProps) {
  return (
    <section className="summary-insights-section">
      <h2 className="summary-insights-section__title">{title}</h2>
      <div className="summary-insights-section__content">{children}</div>
    </section>
  );
}
