/**
 * Development Intelligence view model upgraded with Evidence Confidence,
 * Coverage, Graph and explainability — extends rather than replaces existing DI.
 */

import {
  capabilityLabel,
  foundationLabelsForCapability,
  PRIDMORA_CAPABILITIES,
} from "@/lib/development-evidence/capabilities";
import { calculateEvidenceConfidence } from "@/lib/development-evidence/confidence";
import {
  COVERAGE_DISPLAY_LABELS,
  EVIDENCE_TYPE_LABELS,
  FRESHNESS_DISPLAY_LABELS,
} from "@/lib/development-evidence/constants";
import { calculateEvidenceCoverage } from "@/lib/development-evidence/coverage";
import { buildEvidenceGraph } from "@/lib/development-evidence/graph";
import type {
  CapabilityEvidenceInsight,
  DevelopmentEvidenceObservation,
  DevelopmentEvidenceRecord,
  DevelopmentIntelligenceEvidenceView,
  EvidenceListItem,
  EvidenceWhyThisPayload,
} from "@/lib/development-evidence/types";

export function toEvidenceListItem(
  record: DevelopmentEvidenceRecord,
  options?: {
    observationCount?: number;
    approvedObservationCount?: number;
    fileName?: string | null;
    capturedByLabel?: string | null;
  }
): EvidenceListItem {
  return {
    id: record.id,
    title: record.title,
    evidenceType: record.evidenceType,
    evidenceTypeLabel: EVIDENCE_TYPE_LABELS[record.evidenceType],
    evidenceDate: record.evidenceDate,
    sourceLabel: record.sourceLabel,
    sourceType: record.sourceType,
    capturedByLabel: options?.capturedByLabel ?? null,
    processingStatus: record.processingStatus,
    reviewStatus: record.reviewStatus,
    includeInIntelligence: record.includeInIntelligence,
    freshnessClass: record.freshnessClass,
    freshnessLabel: FRESHNESS_DISPLAY_LABELS[record.freshnessClass],
    restricted: record.restricted,
    observationCount: options?.observationCount ?? 0,
    approvedObservationCount: options?.approvedObservationCount ?? 0,
    fileName: options?.fileName ?? null,
  };
}

function toConfidenceInputs(records: DevelopmentEvidenceRecord[]) {
  return records.map(item => ({
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
        observation => observation.behaviouralEvidence?.trim()
      )
    ),
    capabilityKeys: item.capabilityKeys,
    contradictionCount:
      item.structuredEvidence.contradictoryEvidence?.length ?? 0,
  }));
}

export function buildCapabilityInsights(
  records: DevelopmentEvidenceRecord[],
  organisationFrameworkLabelsByCapability: Record<string, string[]> = {}
): CapabilityEvidenceInsight[] {
  const included = records.filter(
    item =>
      item.includeInIntelligence &&
      !item.deletedAt &&
      item.reviewStatus !== "rejected" &&
      item.reviewStatus !== "excluded"
  );

  const insights: CapabilityEvidenceInsight[] = [];

  for (const capability of PRIDMORA_CAPABILITIES) {
    const supporting = included.filter(item =>
      item.capabilityKeys.includes(capability.key)
    );
    if (supporting.length === 0) continue;

    const confidence = calculateEvidenceConfidence({
      evidence: toConfidenceInputs(supporting),
      capabilityKey: capability.key,
    });
    const coverage = calculateEvidenceCoverage(supporting);

    const strengthSignals = supporting.flatMap(
      item => item.structuredEvidence.strengthSignals ?? []
    );
    const developmentSignals = supporting.flatMap(
      item => item.structuredEvidence.developmentSignals ?? []
    );
    const contradictions = supporting.flatMap(
      item => item.structuredEvidence.contradictoryEvidence ?? []
    );

    const recentWeighted = supporting.filter(
      item => item.freshnessClass === "current"
    ).length;
    const ageing = supporting.filter(
      item => item.freshnessClass !== "current"
    ).length;

    let trend: CapabilityEvidenceInsight["trend"] = "insufficient_evidence";
    if (supporting.length === 0) {
      trend = "insufficient_evidence";
    } else if (contradictions.length > 0) {
      trend = "mixed";
    } else if (strengthSignals.length >= developmentSignals.length && recentWeighted > 0) {
      trend = "strengthening";
    } else if (developmentSignals.length > strengthSignals.length) {
      trend = "requiring_attention";
    } else if (ageing > recentWeighted) {
      trend = "mixed";
    } else {
      trend = "strengthening";
    }

    insights.push({
      capabilityKey: capability.key,
      capabilityLabel: capability.label,
      foundationLabels: foundationLabelsForCapability(capability.key),
      organisationFrameworkLabels:
        organisationFrameworkLabelsByCapability[capability.key] ?? [],
      currentEvidence:
        supporting[0]?.sourceSummary ||
        supporting[0]?.structuredEvidence.observations?.[0]?.description ||
        `Reviewed evidence is available for ${capability.label}.`,
      trend,
      confidence,
      coverage,
      supportingEvidenceIds: supporting.map(item => item.id),
      supportingEvidenceTitles: supporting.map(item => item.title),
      developmentOpportunity: developmentSignals[0] ?? null,
      contradictions,
    });
  }

  return insights;
}

export function buildDevelopmentIntelligenceEvidenceView(input: {
  records: DevelopmentEvidenceRecord[];
  currentFocus?: string | null;
  organisationFrameworkLabelsByCapability?: Record<string, string[]>;
}): DevelopmentIntelligenceEvidenceView {
  const active = input.records.filter(item => !item.deletedAt);
  const included = active.filter(
    item =>
      item.includeInIntelligence &&
      item.reviewStatus !== "rejected" &&
      item.reviewStatus !== "excluded"
  );

  const evidenceConfidence = calculateEvidenceConfidence({
    evidence: toConfidenceInputs(included),
  });
  const evidenceCoverage = calculateEvidenceCoverage(included);
  const capabilities = buildCapabilityInsights(
    included,
    input.organisationFrameworkLabelsByCapability
  );
  const graph = buildEvidenceGraph(included);

  const strengthsBeingDemonstrated = Array.from(
    new Set(
      included.flatMap(item => item.structuredEvidence.strengthSignals ?? [])
    )
  ).slice(0, 6);

  const developmentPriorities = Array.from(
    new Set(
      included.flatMap(item => item.structuredEvidence.developmentSignals ?? [])
    )
  ).slice(0, 6);

  const contradictions = Array.from(
    new Set(
      included.flatMap(
        item => item.structuredEvidence.contradictoryEvidence ?? []
      )
    )
  );

  const missing = evidenceCoverage.notRepresentedLabels.slice(0, 4).map(
    label => `${label} is not yet represented in the reviewed evidence base.`
  );

  const missingOrConflicting = [...contradictions, ...missing].slice(0, 8);

  const recentEvidence = [...included]
    .sort((a, b) => {
      const aDate = a.evidenceDate || a.capturedAt;
      const bDate = b.evidenceDate || b.capturedAt;
      return bDate.localeCompare(aDate);
    })
    .slice(0, 6)
    .map(item => toEvidenceListItem(item));

  const strengthening = capabilities.filter(item => item.trend === "strengthening");
  const attention = capabilities.filter(
    item => item.trend === "requiring_attention"
  );

  const currentPosition =
    input.currentFocus?.trim() ||
    (included.length === 0
      ? "Limited evidence is available to describe current position with confidence."
      : strengthsBeingDemonstrated[0]
        ? `Current evidence highlights ${strengthsBeingDemonstrated[0].toLowerCase()}.`
        : "Reviewed development evidence is beginning to describe current position.");

  const developmentTrajectory =
    included.length === 0
      ? "There is not yet enough reviewed evidence to describe a development trajectory."
      : strengthening.length > 0 && attention.length > 0
        ? `Evidence suggests strengthening in ${strengthening
            .slice(0, 2)
            .map(item => item.capabilityLabel)
            .join(" and ")}, while ${attention
            .slice(0, 2)
            .map(item => item.capabilityLabel)
            .join(" and ")} still needs attention.`
        : strengthening.length > 0
          ? `Evidence suggests development is strengthening in ${strengthening
              .slice(0, 3)
              .map(item => item.capabilityLabel)
              .join(", ")}.`
          : "Evidence is currently mixed or limited; trajectory should be treated cautiously.";

  const nextDevelopmentFocus =
    developmentPriorities[0] ||
    attention[0]?.developmentOpportunity ||
    (evidenceCoverage.level === "limited"
      ? "A useful next area to explore may be gathering broader evidence across conversations, feedback and reflection."
      : "A useful next area to explore may be the highest-priority development signal supported by recent evidence.");

  return {
    currentPosition,
    developmentTrajectory,
    capabilities,
    strengthsBeingDemonstrated,
    developmentPriorities,
    evidenceConfidence,
    evidenceCoverage,
    recentEvidence,
    missingOrConflicting,
    nextDevelopmentFocus,
    graph,
  };
}

export function buildWhyThisPayload(input: {
  insight: string;
  records: DevelopmentEvidenceRecord[];
  observations?: DevelopmentEvidenceObservation[];
}): EvidenceWhyThisPayload {
  const included = input.records.filter(
    item => item.includeInIntelligence && !item.deletedAt
  );
  const confidence = calculateEvidenceConfidence({
    evidence: toConfidenceInputs(included),
  });
  const coverage = calculateEvidenceCoverage(included);

  const freshness =
    included.find(item => item.freshnessClass === "current")?.freshnessClass ??
    included[0]?.freshnessClass ??
    "current";

  const observedBehaviours = [
    ...(input.observations ?? [])
      .filter(item => item.includeInIntelligence)
      .map(item => item.behaviouralEvidence)
      .filter((value): value is string => Boolean(value?.trim())),
    ...included.flatMap(
      item =>
        item.structuredEvidence.observations
          ?.map(observation => observation.behaviouralEvidence)
          .filter((value): value is string => Boolean(value?.trim())) ?? []
    ),
  ].slice(0, 8);

  const limitations = Array.from(
    new Set(
      included.flatMap(item => item.structuredEvidence.limitations ?? [])
    )
  ).slice(0, 6);

  const contradictoryEvidence = Array.from(
    new Set(
      included.flatMap(
        item => item.structuredEvidence.contradictoryEvidence ?? []
      )
    )
  ).slice(0, 6);

  const developmentImplication =
    input.observations?.find(item => item.developmentImplication)
      ?.developmentImplication ??
    included
      .flatMap(item => item.structuredEvidence.observations ?? [])
      .find(item => item.developmentImplication)?.developmentImplication ??
    null;

  return {
    insight: input.insight,
    confidence,
    coverage,
    freshness,
    freshnessLabel: FRESHNESS_DISPLAY_LABELS[freshness],
    supportingSources: included.map(item => ({
      id: item.id,
      title: item.title,
      evidenceTypeLabel: EVIDENCE_TYPE_LABELS[item.evidenceType],
      sourceKind:
        item.sourceType === "uploaded_document" ||
        item.sourceType === "sample_seed"
          ? "uploaded"
          : item.evidenceType === "development_conversation" ||
              item.evidenceType === "summary_insights"
            ? "conversation"
            : item.evidenceType === "reflection" ||
                item.evidenceType === "personal_reflection"
              ? "reflection"
              : "other",
      drilldownPath:
        item.evidenceType === "summary_insights" && item.sourceRecordId
          ? `summary:${item.sourceRecordId}`
          : item.evidenceType === "reflection" && item.sourceRecordId
            ? `reflection:${item.sourceRecordId}`
            : `evidence:${item.id}`,
    })),
    contradictoryEvidence,
    limitations,
    observedBehaviours,
    developmentImplication,
  };
}

export function coverageSummaryCopy(
  level: ReturnType<typeof calculateEvidenceCoverage>["level"]
): string {
  return `${COVERAGE_DISPLAY_LABELS[level]} evidence base`;
}

export function capabilityInsightTitle(key: string): string {
  return capabilityLabel(key);
}
