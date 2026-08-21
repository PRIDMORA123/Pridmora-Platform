"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { BRAND } from "@/lib/brand";
import { COACHING_INTELLIGENCE_MODES } from "@/lib/coaching-intelligence/mode-config";
import type {
  CoachingIntelligenceMode,
  IntelligenceSource,
} from "@/types/coaching-intelligence";

type IntelligenceDetailsDrawerProps = {
  isOpen: boolean;
  mode: CoachingIntelligenceMode;
  usedSources: IntelligenceSource[];
  lastRefreshedAt?: string | null;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
};

export function IntelligenceDetailsDrawer({
  isOpen,
  mode,
  usedSources,
  lastRefreshedAt,
  onClose,
  triggerRef,
}: IntelligenceDetailsDrawerProps) {
  const drawerRef = React.useRef<HTMLElement>(null);
  const configuration = COACHING_INTELLIGENCE_MODES[mode];

  React.useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    requestAnimationFrame(() => {
      const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusableElements = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => {
        triggerRef?.current?.focus();
      });
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <button
        type="button"
        className="intelligence-drawer-backdrop"
        aria-label="Close coaching intelligence details"
        onClick={onClose}
      />

      <aside
        ref={drawerRef}
        className="intelligence-details-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intelligence-details-title"
      >
        <header>
          <div>
            <p>Professional Coaching Intelligence™</p>
            <h2 id="intelligence-details-title">
              {configuration.label} support
            </h2>
          </div>

          <button type="button" onClick={onClose} aria-label="Close details">
            Close
          </button>
        </header>

        <div className="intelligence-details-drawer__body">
          <section>
            <h3>What this level does</h3>
            <p>{configuration.fullDescription}</p>
          </section>

          <section>
            <h3>Evidence available to this mode</h3>

            {configuration.sources.length > 0 ? (
              <ul className="intelligence-source-list">
                {configuration.sources.map(source => (
                  <li key={source}>
                    <span
                      className={usedSources.includes(source) ? "is-used" : ""}
                      aria-hidden="true"
                    >
                      {usedSources.includes(source) ? "✓" : "–"}
                    </span>

                    <div>
                      <strong>{formatSourceLabel(source)}</strong>
                      <small>
                        {usedSources.includes(source)
                          ? "Used in the latest preparation"
                          : "No approved information currently available"}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="identity-empty-copy">
                Human-led mode does not analyse coaching records.
              </p>
            )}
          </section>

          <section>
            <h3>Support it may provide</h3>

            {configuration.outputs.length > 0 ? (
              <ul>
                {configuration.outputs.map(output => (
                  <li key={output}>{output}</li>
                ))}
              </ul>
            ) : (
              <p className="identity-empty-copy">
                No AI-generated preparation is provided.
              </p>
            )}
          </section>

          <section className="intelligence-evidence-rule">
            <h3>Professional safeguard</h3>
            <p>
              {BRAND.intelligenceName} does not approve coaching insights.
              Generated content remains proposed until you review and decide
              what should be retained.
            </p>

            {lastRefreshedAt ? (
              <small>
                Latest refresh:{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(lastRefreshedAt))}
              </small>
            ) : null}
          </section>
        </div>
      </aside>
    </>,
    document.body
  );
}

function formatSourceLabel(source: IntelligenceSource) {
  const labels: Record<IntelligenceSource, string> = {
    previous_conversations: "Previous conversations",
    approved_summaries: "Approved summaries",
    open_commitments: "Open commitments",
    approved_reflections: "Approved reflections",
    journey_evidence: "Journey evidence",
    development_themes: "Development themes",
    approved_reports: "Approved reports",
    authorised_development_evidence: "Authorised development evidence",
  };

  return labels[source];
}
