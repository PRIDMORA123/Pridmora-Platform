/**
 * Evidence Graph — navigable relationships, not a decorative visualisation.
 */

import {
  capabilityLabel,
  relatedCapabilities,
} from "@/lib/development-evidence/capabilities";
import { calculateEvidenceConfidence } from "@/lib/development-evidence/confidence";
import { EVIDENCE_TYPE_LABELS } from "@/lib/development-evidence/constants";
import type {
  DevelopmentEvidenceRecord,
  EvidenceGraphNode,
} from "@/lib/development-evidence/types";

export function buildEvidenceGraph(
  evidence: DevelopmentEvidenceRecord[]
): EvidenceGraphNode[] {
  const included = evidence.filter(
    item =>
      item.includeInIntelligence &&
      !item.deletedAt &&
      item.reviewStatus !== "rejected" &&
      item.reviewStatus !== "excluded"
  );

  const byCapability = new Map<string, DevelopmentEvidenceRecord[]>();

  for (const item of included) {
    const keys =
      item.capabilityKeys.length > 0
        ? item.capabilityKeys
        : inferFromStructured(item);

    for (const key of keys) {
      const list = byCapability.get(key) ?? [];
      list.push(item);
      byCapability.set(key, list);
    }
  }

  const nodes: EvidenceGraphNode[] = [];

  for (const [capabilityKey, items] of byCapability) {
    const confidence = calculateEvidenceConfidence({
      evidence: items.map(item => ({
        id: item.id,
        evidenceType: item.evidenceType,
        sourceType: item.sourceType,
        freshnessClass: item.freshnessClass,
        includeInIntelligence: item.includeInIntelligence,
        reviewStatus: item.reviewStatus,
        independenceKey:
          item.contentHash ||
          item.sourceRecordId ||
          `${item.evidenceType}:${item.title}`,
        hasBehaviouralSpecificity: Boolean(
          item.structuredEvidence.observations?.some(
            observation => observation.behaviouralEvidence
          )
        ),
        capabilityKeys: item.capabilityKeys,
        contradictionCount:
          item.structuredEvidence.contradictoryEvidence?.length ?? 0,
      })),
      capabilityKey,
    });

    nodes.push({
      capabilityKey,
      capabilityLabel: capabilityLabel(capabilityKey),
      relatedCapabilities: relatedCapabilities(capabilityKey).map(capabilityLabel),
      supportingEvidence: items.map(item => ({
        id: item.id,
        title: item.title,
        evidenceTypeLabel: EVIDENCE_TYPE_LABELS[item.evidenceType],
        freshnessClass: item.freshnessClass,
        includeInIntelligence: item.includeInIntelligence,
      })),
      confidence: confidence.level,
    });
  }

  return nodes.sort(
    (a, b) => b.supportingEvidence.length - a.supportingEvidence.length
  );
}

function inferFromStructured(item: DevelopmentEvidenceRecord): string[] {
  const fromObservations =
    item.structuredEvidence.observations
      ?.map(observation => observation.capabilityKey)
      .filter((value): value is string => Boolean(value)) ?? [];
  if (fromObservations.length > 0) {
    return Array.from(new Set(fromObservations));
  }
  return ["communication"];
}
