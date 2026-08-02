"use client";

import { getRelationshipSubtitle } from "@/lib/coaching-journey";

export function RelationshipCanvasHeader({
  clientName,
  role,
  organisation,
  startedLabel,
  status,
  actions,
}: {
  clientName: string;
  role?: string | null;
  organisation?: string | null;
  startedLabel?: string | null;
  status?: string | null;
  actions?: React.ReactNode;
}) {
  const subtitle = getRelationshipSubtitle({
    role: role ?? undefined,
    organisation: organisation ?? undefined,
  });

  return (
    <header className="relationship-canvas-header">
      <div className="relationship-canvas-header__copy">
        <h1 className="relationship-canvas-header__name">{clientName}</h1>
        {subtitle ? (
          <p className="relationship-canvas-header__role">{subtitle}</p>
        ) : null}
        <p className="relationship-canvas-header__meta">
          {[
            "Coaching relationship",
            startedLabel ? `Started ${startedLabel}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {status && status !== "Active" ? (
          <p className="relationship-canvas-header__status">{status}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="relationship-canvas-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
