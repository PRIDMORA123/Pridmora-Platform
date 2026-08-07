"use client";

import { useState } from "react";
import type { EvidenceGraphNode } from "@/lib/development-evidence";
import { CONFIDENCE_DISPLAY_LABELS } from "@/lib/development-evidence";

export function EvidenceGraphPanel({
  nodes,
  onOpenEvidence,
}: {
  nodes: EvidenceGraphNode[];
  onOpenEvidence?: (evidenceId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(
    nodes[0]?.capabilityKey ?? null
  );

  if (nodes.length === 0) {
    return (
      <section className="panel evidence-graph-panel">
        <p className="card-label">Evidence Graph</p>
        <h2 className="identity-subheading">Capability evidence</h2>
        <p className="muted">
          As reviewed evidence is included, related capabilities and supporting
          sources will appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="panel evidence-graph-panel">
      <p className="card-label">Evidence Graph</p>
      <h2 className="identity-subheading">Capability evidence</h2>
      <p className="muted">
        Expand a capability to inspect the reviewed sources that support it.
      </p>
      <ul className="evidence-graph-list">
        {nodes.map(node => {
          const isOpen = expanded === node.capabilityKey;
          return (
            <li key={node.capabilityKey} className="evidence-graph-item">
              <button
                type="button"
                className="evidence-graph-item__trigger"
                aria-expanded={isOpen}
                onClick={() =>
                  setExpanded(isOpen ? null : node.capabilityKey)
                }
              >
                <span>
                  <strong>{node.capabilityLabel}</strong>
                  <span className="muted">
                    {" "}
                    · Confidence {CONFIDENCE_DISPLAY_LABELS[node.confidence]}
                  </span>
                </span>
                <span className="muted">
                  {node.supportingEvidence.length} source
                  {node.supportingEvidence.length === 1 ? "" : "s"}
                </span>
              </button>
              {isOpen ? (
                <div className="evidence-graph-item__body">
                  <p className="evidence-graph-item__label">Supported by</p>
                  <ul className="development-evidence-list">
                    {node.supportingEvidence.map(source => (
                      <li key={source.id}>
                        {onOpenEvidence ? (
                          <button
                            type="button"
                            className="identity-text-action"
                            onClick={() => onOpenEvidence(source.id)}
                          >
                            {source.title}
                          </button>
                        ) : (
                          <strong>{source.title}</strong>
                        )}
                        <span className="muted">
                          {" "}
                          — {source.evidenceTypeLabel}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {node.relatedCapabilities.length > 0 ? (
                    <>
                      <p className="evidence-graph-item__label">
                        Related capabilities
                      </p>
                      <p className="muted">
                        {node.relatedCapabilities.join(", ")}
                      </p>
                    </>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
