import type { SupabaseClient } from "@supabase/supabase-js";
import {
  selectAuthorisedObservationsForPreparation,
  type PreparationAuthorisedObservation,
} from "@/lib/coaching-intelligence/authorised-development-evidence";
import { COACHING_INTELLIGENCE_MODES } from "@/lib/coaching-intelligence/mode-config";
import { COACHING_INTELLIGENCE_RULES } from "@/lib/coaching-intelligence/rules";
import { listEvidenceForClient } from "@/lib/development-evidence";
import { mapObservationRow } from "@/lib/development-evidence/map";
import {
  ensureProfileOrEmpty,
  listDevelopmentUpdatesForClient,
} from "@/lib/development-updates/repository";
import { getApprovedRelationshipEvidence } from "@/lib/journey/load-journey-view-model";
import { listDevelopmentReportsForClient } from "@/lib/reports/repository";
import { assertRelationshipOwnership } from "@/lib/relationship-scope";
import { rowToSession } from "@/lib/supabase/map";
import type { IntelligenceSource } from "@/types/coaching-intelligence";

export type ResolvedIntelligenceSources = {
  previousConversations: Array<{
    id: string;
    sessionNumber: number;
    date: string;
    focus: string;
    summary: string;
    commitments: string;
    emergingThemes: string;
  }>;
  approvedSummaries: Array<{
    id: string;
    summary: string;
    focus: string;
  }>;
  openCommitments: Array<{
    id: string;
    statement: string;
    dueDate: string | null;
  }>;
  approvedReflections: Array<{
    id: string;
    summary: string;
  }>;
  journeyEvidence: Array<{
    id: string;
    summary: string;
    focus: string;
  }>;
  developmentThemes: string[];
  approvedReports: Array<{
    id: string;
    title: string;
    summary: string;
  }>;
  /** Authorised Development Evidence library observations only. */
  authorisedDevelopmentEvidence: PreparationAuthorisedObservation[];
  usedSources: IntelligenceSource[];
};

async function assertRelationshipOwnershipLocal(
  supabase: SupabaseClient,
  coachId: string,
  relationshipId: string
) {
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", relationshipId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("RELATIONSHIP_NOT_FOUND");
  }
}

export async function loadAuthorisedDevelopmentEvidenceForPreparation(input: {
  supabase: SupabaseClient;
  coachId: string;
  relationshipId: string;
}): Promise<PreparationAuthorisedObservation[]> {
  const evidence = await listEvidenceForClient(
    input.supabase,
    input.coachId,
    input.relationshipId
  );

  assertRelationshipOwnership(
    input.relationshipId,
    evidence.map(item => ({ relationshipId: item.clientId, id: item.id }))
  );

  if (evidence.length === 0) return [];

  const evidenceIds = evidence.map(item => item.id);
  const { data: observationRows, error } = await input.supabase
    .from("development_evidence_observations")
    .select(
      "id, evidence_id, organisation_id, client_id, title, description, category, behavioural_evidence, development_implication, source_confidence, assessment_context, limitations, capability_key, include_in_intelligence, review_status, sort_order, created_at, updated_at"
    )
    .eq("client_id", input.relationshipId)
    .in("evidence_id", evidenceIds);

  if (error) {
    throw new Error("Unable to load development evidence observations.");
  }

  const observations = (observationRows ?? []).map(row =>
    mapObservationRow(row as Record<string, unknown>)
  );

  assertRelationshipOwnership(
    input.relationshipId,
    observations.map(item => ({
      relationshipId: item.clientId,
      id: item.id,
    }))
  );

  // Observation rows only — never structured_evidence.observations or documents.
  return selectAuthorisedObservationsForPreparation({
    evidence,
    observations,
  });
}

export async function resolveIntelligenceSources({
  supabase,
  coachId,
  relationshipId,
  conversationId,
  mode,
}: {
  supabase: SupabaseClient;
  coachId: string;
  relationshipId: string;
  conversationId: string;
  mode: "assisted" | "comprehensive";
}): Promise<ResolvedIntelligenceSources> {
  await assertRelationshipOwnershipLocal(supabase, coachId, relationshipId);

  const configuration = COACHING_INTELLIGENCE_MODES[mode];
  const usedSources: IntelligenceSource[] = [];

  const result: ResolvedIntelligenceSources = {
    previousConversations: [],
    approvedSummaries: [],
    openCommitments: [],
    approvedReflections: [],
    journeyEvidence: [],
    developmentThemes: [],
    approvedReports: [],
    authorisedDevelopmentEvidence: [],
    usedSources,
  };

  const { data: sessionRows } = await supabase
    .from("sessions")
    .select("*")
    .eq("client_id", relationshipId)
    .eq("coach_id", coachId)
    .order("session_number", { ascending: false });

  const sessions = (sessionRows ?? []).map((row, index, all) =>
    rowToSession(row, index, all.length)
  );

  assertRelationshipOwnership(
    relationshipId,
    sessions.map(item => ({ relationshipId: item.clientId }))
  );

  if (configuration.sources.includes("previous_conversations")) {
    const previous = sessions
      .filter(
        item =>
          item.id !== conversationId &&
          (item.status === "completed" || item.aiSummaryApproved)
      )
      .slice(0, mode === "assisted" ? 1 : 6);

    result.previousConversations = previous.map(item => ({
      id: item.id,
      sessionNumber: item.sessionNumber,
      date: item.date || item.completedAt || "",
      focus: item.focus,
      summary: item.summaryStatus === "approved" || item.aiSummaryApproved
        ? item.summary
        : "",
      commitments: item.commitments || item.agreedActions || "",
      emergingThemes: item.emergingThemes || "",
    }));

    if (result.previousConversations.length > 0) {
      usedSources.push("previous_conversations");
    }
  }

  if (configuration.sources.includes("approved_summaries")) {
    if (!COACHING_INTELLIGENCE_RULES.includeUnapprovedSummaries) {
      const approved = sessions
        .filter(
          item =>
            item.id !== conversationId &&
            (item.summaryStatus === "approved" || item.aiSummaryApproved)
        )
        .slice(0, mode === "assisted" ? 1 : 6);

      result.approvedSummaries = approved.map(item => ({
        id: item.id,
        summary: item.summary,
        focus: item.focus,
      }));

      if (result.approvedSummaries.length > 0) {
        usedSources.push("approved_summaries");
      }
    }
  }

  if (configuration.sources.includes("open_commitments")) {
    const { data: actionRows } = await supabase
      .from("client_items")
      .select("id, title, status, event_date, client_id")
      .eq("client_id", relationshipId)
      .eq("coach_id", coachId)
      .eq("item_type", "action");

    const actions = (actionRows ?? []).filter(
      row =>
        String(row.client_id) === relationshipId &&
        String(row.status ?? "") !== "Complete"
    );

    result.openCommitments = actions.map(row => ({
      id: String(row.id),
      statement: String(row.title ?? ""),
      dueDate: row.event_date ? String(row.event_date) : null,
    }));

    // Also include open commitments recorded on the development profile.
    const profile = await ensureProfileOrEmpty(
      supabase,
      coachId,
      relationshipId,
      ""
    );
    if (profile) {
      assertRelationshipOwnership(relationshipId, [profile]);
      for (const commitment of profile.commitments ?? []) {
        if (commitment.status === "open" && commitment.value.trim()) {
          result.openCommitments.push({
            id: commitment.id,
            statement: commitment.value,
            dueDate: commitment.dueDate,
          });
        }
      }
    }

    if (result.openCommitments.length > 0) {
      usedSources.push("open_commitments");
    }
  }

  if (configuration.sources.includes("approved_reflections")) {
    if (!COACHING_INTELLIGENCE_RULES.includeUnapprovedReflections) {
      // Shareable reflection fields only — never private coach notes.
      const reflections = sessions
        .filter(
          item =>
            item.id !== conversationId &&
            (item.summaryStatus === "approved" || item.aiSummaryApproved) &&
            (item.reflectWhatShifted ||
              item.reflectWhatSurprised ||
              item.reflectWhatWorked ||
              item.professionalIdentityDevelopment)
        )
        .slice(0, 4)
        .map(item => ({
          id: item.id,
          summary: [
            item.reflectWhatShifted,
            item.reflectWhatSurprised,
            item.reflectWhatWorked,
            item.professionalIdentityDevelopment,
          ]
            .filter(Boolean)
            .join(" "),
        }));

      result.approvedReflections = reflections.filter(item =>
        item.summary.trim()
      );

      if (result.approvedReflections.length > 0) {
        usedSources.push("approved_reflections");
      }
    }
  }

  if (configuration.sources.includes("journey_evidence")) {
    if (!COACHING_INTELLIGENCE_RULES.includeUnapprovedJourneyEvidence) {
      const evidence = await getApprovedRelationshipEvidence(supabase, {
        coachId,
        relationshipId,
      });
      assertRelationshipOwnership(relationshipId, evidence);
      result.journeyEvidence = evidence.map(item => ({
        id: item.id,
        summary: item.summary,
        focus: item.focus,
      }));
      if (result.journeyEvidence.length > 0) {
        usedSources.push("journey_evidence");
      }
    }
  }

  if (configuration.sources.includes("development_themes")) {
    const profile = await ensureProfileOrEmpty(
      supabase,
      coachId,
      relationshipId,
      ""
    );
    const updates = await listDevelopmentUpdatesForClient(
      supabase,
      coachId,
      relationshipId
    );
    if (profile) assertRelationshipOwnership(relationshipId, [profile]);
    assertRelationshipOwnership(relationshipId, updates);

    const themes = [
      ...(profile?.emergingThemes ?? []).map(entry => entry.value),
      ...(profile?.patterns ?? []).map(entry => entry.value),
      ...updates
        .filter(update => update.status === "applied")
        .flatMap(update =>
          (update.proposedChanges.emergingThemes?.add ?? []).map(
            entry => entry.value
          )
        ),
    ]
      .map(value => value.trim())
      .filter(Boolean);

    result.developmentThemes = Array.from(new Set(themes)).slice(0, 12);
    if (result.developmentThemes.length > 0) {
      usedSources.push("development_themes");
    }
  }

  if (configuration.sources.includes("approved_reports")) {
    if (!COACHING_INTELLIGENCE_RULES.includeArchivedReports) {
      const reports = await listDevelopmentReportsForClient(
        supabase,
        coachId,
        relationshipId
      );
      assertRelationshipOwnership(
        relationshipId,
        reports.map(report => ({ relationshipId: report.relationshipId }))
      );

      result.approvedReports = reports
        .filter(report => report.status === "approved")
        .slice(0, 3)
        .map(report => ({
          id: report.id,
          title: report.title,
          summary: [
            report.executiveSummary,
            report.progressSummary,
            report.developmentThemes.map(theme => theme.summary).join(" "),
            report.futurePriorities.join("; "),
          ]
            .filter(Boolean)
            .join("\n"),
        }))
        .filter(report => report.summary.trim());

      if (result.approvedReports.length > 0) {
        usedSources.push("approved_reports");
      }
    }
  }

  if (configuration.sources.includes("authorised_development_evidence")) {
    result.authorisedDevelopmentEvidence =
      await loadAuthorisedDevelopmentEvidenceForPreparation({
        supabase,
        coachId,
        relationshipId,
      });
    if (result.authorisedDevelopmentEvidence.length > 0) {
      usedSources.push("authorised_development_evidence");
    }
  }

  return result;
}
