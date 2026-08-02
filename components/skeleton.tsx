"use client";

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`skeleton-block identity-skeleton ${className}`.trim()}
      aria-hidden
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <article className="panel skeleton-card" aria-hidden>
      <SkeletonBlock className="skeleton-label" />
      <SkeletonBlock className="skeleton-title" />
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock key={index} className={index === lines - 1 ? "skeleton-line short" : "skeleton-line"} />
      ))}
    </article>
  );
}

export function SkeletonGrid({
  cards = 3,
  columns = "three",
}: {
  cards?: number;
  columns?: "three" | "two" | "client";
}) {
  const gridClass =
    columns === "client" ? "client-grid" : columns === "two" ? "two-grid" : "three-grid";

  return (
    <div className={gridClass} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: cards }).map((_, index) => (
        <SkeletonCard key={index} lines={columns === "client" ? 4 : 3} />
      ))}
    </div>
  );
}

export function PageSkeleton({
  heading = true,
  cards = 3,
  columns = "three",
}: {
  heading?: boolean;
  cards?: number;
  columns?: "three" | "two" | "client";
}) {
  return (
    <section className="page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your coaching workspace…</span>
      {heading && (
        <div className="page-heading">
          <SkeletonBlock className="skeleton-label" />
          <SkeletonBlock className="skeleton-heading" />
          <SkeletonBlock className="skeleton-line medium" />
        </div>
      )}
      <SkeletonGrid cards={cards} columns={columns} />
    </section>
  );
}
