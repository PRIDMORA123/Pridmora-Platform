"use client";

import { IdentityDrawer } from "@/components/identity/drawer";
import {
  confidenceDisplayLabel,
  directionLabel,
  directionScreenReaderLabel,
} from "@/lib/organisation-intelligence";
import type { EvidenceTrace } from "@/lib/organisation-intelligence";

export function OrganisationIntelligenceEvidenceDrawer({
  open,
  trace,
  onClose,
}: {
  open: boolean;
  trace: EvidenceTrace | null;
  onClose: () => void;
}) {
  return (
    <IdentityDrawer
      open={open}
      eyebrow="Evidence"
      title={trace?.insightLabel || "Supporting evidence"}
      description="Aggregated evidence behind this insight. Raw notes and private identity are never shown."
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn secondary"
          onClick={() => onClose()}
        >
          Close
        </button>
      }
    >
      {trace ? (
        <div className="org-intelligence-drawer-stack">
          <dl className="org-intelligence-meta-list">
            <div>
              <dt>Evidence count</dt>
              <dd>{trace.evidenceCount}</dd>
            </div>
            <div>
              <dt>Relationship count</dt>
              <dd>{trace.relationshipCount}</dd>
            </div>
            <div>
              <dt>Date range</dt>
              <dd>
                {trace.dateRange.start} to {trace.dateRange.end}
              </dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{confidenceDisplayLabel(trace.confidenceLevel)}</dd>
            </div>
            <div>
              <dt>Direction context</dt>
              <dd>
                <span className="org-intelligence-sr-only">
                  {directionScreenReaderLabel(
                    trace.suppressionApplied
                      ? "insufficient_evidence"
                      : "stable"
                  )}
                </span>
                {trace.suppressionApplied
                  ? "Suppressed"
                  : "Available for review"}
              </dd>
            </div>
          </dl>

          <section>
            <h3 className="org-intelligence-drawer-heading">Source types</h3>
            <ul className="org-intelligence-simple-list">
              {trace.sourceTypes.map(type => (
                <li key={type}>{type.replace(/_/g, " ")}</li>
              ))}
            </ul>
          </section>

          {trace.capabilities.length > 0 ? (
            <section>
              <h3 className="org-intelligence-drawer-heading">
                Capabilities involved
              </h3>
              <ul className="org-intelligence-simple-list">
                {trace.capabilities.map(capability => (
                  <li key={capability}>{capability.replace(/_/g, " ")}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="org-intelligence-drawer-heading">Confidence basis</h3>
            <p className="organisation-muted">{trace.confidenceBasis}</p>
          </section>

          <section>
            <h3 className="org-intelligence-drawer-heading">
              Suppression applied
            </h3>
            <p className="organisation-muted">
              {trace.suppressionApplied
                ? trace.suppressionReason ||
                  "Not enough evidence to report safely."
                : "No suppression applied for this insight."}
            </p>
          </section>
        </div>
      ) : (
        <p className="organisation-muted">No evidence selected.</p>
      )}
    </IdentityDrawer>
  );
}

export function OrganisationIntelligenceThemeDrawer({
  open,
  themeLabel,
  summary,
  direction,
  evidenceCount,
  relationshipCount,
  confidence,
  relatedCapabilities,
  evidenceTypes,
  onClose,
  onViewEvidence,
}: {
  open: boolean;
  themeLabel: string;
  summary: string | null;
  direction: string | null;
  evidenceCount: number;
  relationshipCount: number;
  confidence: string;
  relatedCapabilities: string[];
  evidenceTypes: string[];
  onClose: () => void;
  onViewEvidence: () => void;
}) {
  return (
    <IdentityDrawer
      open={open}
      eyebrow="Theme detail"
      title={themeLabel}
      description="Anonymised theme summary. Paraphrased evidence only."
      onClose={onClose}
      footer={
        <div className="org-intelligence-drawer-actions">
          <button
            type="button"
            className="btn secondary"
            onClick={() => onClose()}
          >
            Close
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onViewEvidence()}
          >
            View supporting evidence
          </button>
        </div>
      }
    >
      <div className="org-intelligence-drawer-stack">
        <p>{summary || "Not enough evidence to report safely."}</p>
        <dl className="org-intelligence-meta-list">
          <div>
            <dt>Trend</dt>
            <dd>
              <span className="org-intelligence-sr-only">
                {directionScreenReaderLabel(
                  (direction as Parameters<typeof directionScreenReaderLabel>[0]) ||
                    "insufficient_evidence"
                )}
              </span>
              {directionLabel(
                (direction as Parameters<typeof directionLabel>[0]) ||
                  "insufficient_evidence"
              )}
            </dd>
          </div>
          <div>
            <dt>Evidence count</dt>
            <dd>{evidenceCount}</dd>
          </div>
          <div>
            <dt>Relationship count</dt>
            <dd>{relationshipCount}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{confidenceDisplayLabel(confidence as "low" | "moderate" | "high")}</dd>
          </div>
        </dl>

        <section>
          <h3 className="org-intelligence-drawer-heading">
            Related capabilities
          </h3>
          {relatedCapabilities.length > 0 ? (
            <ul className="org-intelligence-simple-list">
              {relatedCapabilities.map(item => (
                <li key={item}>{item.replace(/_/g, " ")}</li>
              ))}
            </ul>
          ) : (
            <p className="organisation-muted">No mapped capabilities yet.</p>
          )}
        </section>

        <section>
          <h3 className="org-intelligence-drawer-heading">Evidence types</h3>
          <ul className="org-intelligence-simple-list">
            {evidenceTypes.map(type => (
              <li key={type}>{type.replace(/_/g, " ")}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="org-intelligence-drawer-heading">
            Anonymised evidence summary
          </h3>
          <p className="organisation-muted">
            {summary
              ? "This summary is paraphrased from approved coaching evidence and contains no quotations, names or confidential references."
              : "Not enough evidence to report safely."}
          </p>
        </section>
      </div>
    </IdentityDrawer>
  );
}
