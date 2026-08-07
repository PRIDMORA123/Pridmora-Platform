"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { EvidenceWhyThisPayload } from "@/lib/development-evidence";
import { getFocusableElements, trapFocusTab } from "@/lib/focus-trap";
import { EvidenceConfidencePanel } from "@/components/development-evidence/evidence-confidence-panel";

export function EvidenceWhyDrawer({
  open,
  payload,
  onClose,
}: {
  open: boolean;
  payload: EvidenceWhyThisPayload | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const focusable = panelRef.current
        ? getFocusableElements(panelRef.current)
        : [];
      (focusable[0] ?? panelRef.current)?.focus();
    });

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (panelRef.current) trapFocusTab(event, panelRef.current);
    }

    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open || !payload) return null;

  return (
    <div className="evidence-drawer-backdrop" role="presentation">
      <aside
        ref={panelRef}
        className="evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="evidence-drawer__header">
          <div>
            <p className="eyebrow">Why this?</p>
            <h2 id={titleId}>{payload.insight}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close evidence drawer"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="evidence-drawer__body">
          <EvidenceConfidencePanel
            confidence={payload.confidence}
            coverage={payload.coverage}
          />

          <section className="development-section">
            <h3>Evidence freshness</h3>
            <p>{payload.freshnessLabel}</p>
          </section>

          <section className="development-section">
            <h3>Supporting sources</h3>
            {payload.supportingSources.length === 0 ? (
              <p className="muted">No permitted supporting sources available.</p>
            ) : (
              <ul className="development-evidence-list">
                {payload.supportingSources.map(source => (
                  <li key={source.id}>
                    <strong>{source.title}</strong>
                    <span className="muted"> — {source.evidenceTypeLabel}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {payload.observedBehaviours.length > 0 ? (
            <section className="development-section">
              <h3>Observed behaviours</h3>
              <ul className="development-evidence-list">
                {payload.observedBehaviours.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {payload.contradictoryEvidence.length > 0 ? (
            <section className="development-section">
              <h3>Contradictory evidence</h3>
              <ul className="development-evidence-list">
                {payload.contradictoryEvidence.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {payload.limitations.length > 0 ? (
            <section className="development-section">
              <h3>Limitations</h3>
              <ul className="development-evidence-list">
                {payload.limitations.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {payload.developmentImplication ? (
            <section className="development-section">
              <h3>Development implication</h3>
              <p>{payload.developmentImplication}</p>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
