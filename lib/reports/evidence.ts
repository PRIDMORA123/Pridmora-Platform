import type { Client, Session } from "@/lib/types";
import type {
  CommitmentEntry,
  DevelopmentProfile,
  DevelopmentUpdate,
} from "@/lib/development-updates/types";
import type {
  AvailableEvidenceItem,
  ReportCommitment,
  ReportEvidenceItem,
} from "@/lib/reports/types";

function isApprovedSession(session: Session): boolean {
  return session.summaryStatus === "approved" || session.aiSummaryApproved === true;
}

function withinPeriod(
  value: string | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  if (!start && !end) return true;
  if (!value) return true;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return true;
  if (start) {
    const startTime = Date.parse(`${start}T00:00:00`);
    if (!Number.isNaN(startTime) && time < startTime) return false;
  }
  if (end) {
    const endTime = Date.parse(`${end}T23:59:59`);
    if (!Number.isNaN(endTime) && time > endTime) return false;
  }
  return true;
}

function truncate(text: string, max = 280): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

/**
 * Build selectable evidence from approved / shareable sources only.
 * Private coach notes and unapproved reflections are never offered.
 */
export function collectAvailableEvidence(input: {
  client: Client;
  profile: DevelopmentProfile | null;
  updates: DevelopmentUpdate[];
  reportingPeriodStart?: string | null;
  reportingPeriodEnd?: string | null;
}): AvailableEvidenceItem[] {
  const {
    client,
    profile,
    updates,
    reportingPeriodStart,
    reportingPeriodEnd,
  } = input;
  const items: AvailableEvidenceItem[] = [];

  const purpose = (profile?.currentFocus || client.currentFocus || "").trim();
  if (purpose) {
    items.push({
      id: `purpose-${client.id}`,
      title: "Agreed coaching purpose",
      summary: truncate(purpose),
      sourceLabel: "Coaching purpose",
      sourceType: "coaching_purpose",
      sourceId: client.id,
      developmentArea: "Coaching purpose",
      evidence: purpose,
      suggested: true,
    });
  }

  const priorities = [
    ...(profile?.growthAreas ?? []).map(entry => entry.value),
    ...client.goals,
  ]
    .map(value => value.trim())
    .filter(Boolean);

  priorities.slice(0, 6).forEach((priority, index) => {
    items.push({
      id: `priority-${index}-${priority.slice(0, 24)}`,
      title: "Confirmed development priority",
      summary: truncate(priority),
      sourceLabel: "Development priority",
      sourceType: "development_priority",
      sourceId: null,
      developmentArea: "Development priority",
      evidence: priority,
      suggested: index < 3,
    });
  });

  const appliedUpdates = updates.filter(
    update =>
      update.status === "applied" &&
      withinPeriod(
        update.appliedAt || update.updatedAt,
        reportingPeriodStart,
        reportingPeriodEnd
      )
  );

  for (const update of appliedUpdates) {
    const summary =
      update.conversationSummary.trim() ||
      update.evidenceSummary
        .map(item => item.evidenceText)
        .filter(Boolean)
        .join(" ");

    if (!summary.trim()) continue;

    items.push({
      id: `update-${update.id}`,
      title: "Approved development update",
      summary: truncate(summary),
      sourceLabel: "Approved development update",
      sourceType: "approved_development_update",
      sourceId: update.id,
      developmentArea: "Development update",
      evidence: summary.trim(),
      suggested: true,
    });

    for (const evidence of update.evidenceSummary.slice(0, 4)) {
      const text = evidence.evidenceText.trim();
      if (!text) continue;
      items.push({
        id: `update-evidence-${update.id}-${evidence.changeKey}`,
        title: evidence.changeKey.replace(/_/g, " "),
        summary: truncate(text),
        sourceLabel: "Approved development update",
        sourceType: "approved_development_update",
        sourceId: update.id,
        developmentArea: evidence.changeKey.replace(/_/g, " "),
        evidence: text,
        suggested: false,
      });
    }
  }

  const completedCommitments: CommitmentEntry[] = (
    profile?.commitments ?? []
  ).filter(commitment => commitment.status === "complete");

  for (const commitment of completedCommitments) {
    const statement = commitment.value.trim();
    if (!statement) continue;
    items.push({
      id: `commitment-${commitment.id}`,
      title: "Completed commitment",
      summary: truncate(statement),
      sourceLabel: "Completed commitment",
      sourceType: "completed_commitment",
      sourceId: commitment.id,
      developmentArea: "Commitment",
      evidence: statement,
      suggested: true,
    });
  }

  for (const action of client.actions.filter(
    action => action.status === "Complete"
  )) {
    const statement = action.title.trim();
    if (!statement) continue;
    items.push({
      id: `action-${action.id}`,
      title: "Completed commitment",
      summary: truncate(statement),
      sourceLabel: "Completed commitment",
      sourceType: "completed_commitment",
      sourceId: action.id,
      developmentArea: "Commitment",
      evidence: statement,
      suggested: true,
    });
  }

  const approvedSessions = client.sessions.filter(
    session =>
      isApprovedSession(session) &&
      withinPeriod(session.completedAt || session.date, reportingPeriodStart, reportingPeriodEnd)
  );

  for (const session of approvedSessions) {
    // Shareable reflection content only — never private notes.
    const shareableParts = [
      session.summary,
      session.professionalIdentityDevelopment,
      session.emergingThemes,
      session.strengthsObserved,
      session.valuesBecomingVisible,
      session.agreedActions,
    ]
      .map(part => part.trim())
      .filter(Boolean);

    if (shareableParts.length === 0) continue;

    const evidence = shareableParts.join("\n\n");
    items.push({
      id: `reflection-${session.id}`,
      title: `Approved reflection · Session ${session.sessionNumber}`,
      summary: truncate(shareableParts[0] ?? evidence),
      sourceLabel: "Approved reflection",
      sourceType: "approved_reflection",
      sourceId: session.id,
      developmentArea: session.focus.trim() || "Approved reflection",
      evidence,
      suggested: true,
    });
  }

  return items;
}

export function evidenceItemsFromSelection(
  selected: AvailableEvidenceItem[]
): ReportEvidenceItem[] {
  return selected.map(item => ({
    id: item.id,
    developmentArea: item.developmentArea,
    evidence: item.evidence,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
  }));
}

export function commitmentsFromSelection(
  selected: AvailableEvidenceItem[],
  profile: DevelopmentProfile | null,
  client: Client
): ReportCommitment[] {
  const fromEvidence = selected
    .filter(item => item.sourceType === "completed_commitment")
    .map(item => ({
      id: item.id,
      statement: item.evidence,
      status: "completed" as const,
    }));

  const inProgress = [
    ...(profile?.commitments ?? [])
      .filter(commitment => commitment.status === "open")
      .map(commitment => ({
        id: `open-${commitment.id}`,
        statement: commitment.value,
        status: "in_progress" as const,
      })),
    ...client.actions
      .filter(
        action =>
          action.status === "Open" || action.status === "In progress"
      )
      .map(action => ({
        id: `open-action-${action.id}`,
        statement: action.title,
        status: "in_progress" as const,
      })),
  ].filter(item => item.statement.trim());

  const seen = new Set<string>();
  return [...fromEvidence, ...inProgress].filter(item => {
    const key = item.statement.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createCoachAddedEvidence(
  developmentArea: string,
  evidence: string
): AvailableEvidenceItem {
  const id = `coach-added-${crypto.randomUUID()}`;
  return {
    id,
    title: developmentArea.trim() || "Coach-added evidence",
    summary: truncate(evidence),
    sourceLabel: "Coach-added evidence",
    sourceType: "coach_added",
    sourceId: null,
    developmentArea: developmentArea.trim() || "Coach-added evidence",
    evidence: evidence.trim(),
    suggested: false,
  };
}
