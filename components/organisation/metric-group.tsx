import type { ReactNode } from "react";

export function MetricGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="organisation-metric-group">
      <h2 className="organisation-metric-group__title">{title}</h2>
      <div className="organisation-metric-group__grid">{children}</div>
    </section>
  );
}

export function MetricItem({
  value,
  label,
  meta,
}: {
  value: number;
  label: string;
  meta?: string;
}) {
  return (
    <div className="organisation-metric-item">
      <p className="organisation-metric-item__value">{value}</p>
      <p className="organisation-metric-item__label">{label}</p>
      {meta ? <p className="organisation-metric-item__meta">{meta}</p> : null}
    </div>
  );
}
