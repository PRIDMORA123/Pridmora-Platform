import type { Client, Session } from "@/lib/types";
import type {
  DevelopmentProfile,
  DevelopmentUpdate,
  ProfileEntry,
  ProfileEntryStatus,
  ProfileItemChange,
  ProposedProfileChanges,
} from "@/lib/development-updates/types";
import { effectiveChanges } from "@/lib/development-updates/types";
import { evidenceForChange } from "@/lib/development-updates/presentation";
import { filterSemanticDuplicates } from "@/lib/intelligence/semantic-overlap";
import type {
  DevelopmentMilestone,
  DevelopmentProfileViewModel,
  DevelopmentTheme,
  DevelopmentThemeEvidenceItem,
  EvidenceConfidence,
} from "@/types/development-profile";

function mapConfidence(status: ProfileEntryStatus): EvidenceConfidence {
  switch (status) {
    case "well_established":
      return "demonstrated";
    case "supported":
      return "developing";
    default:
      return "emerging";
  }
}

function evidenceCountFor(status: ProfileEntryStatus): number {
  switch (status) {
    case "well_established":
      return 3;
    case "supported":
      return 2;
    default:
      return 1;
  }
}

function normaliseThemeValue(value: string): string {
  return value.trim().toLocaleLowerCase("en-GB");
}

function valuesMatchTheme(
  theme: ProfileEntry,
  change: ProfileItemChange
): boolean {
  if (change.id && change.id === theme.id) return true;
  const themeValue = normaliseThemeValue(theme.value);
  const changeValue = normaliseThemeValue(change.value ?? "");
  return Boolean(themeValue) && themeValue === changeValue;
}

function sessionLabelFor(
  sessionId: string | null | undefined,
  sessions: Session[]
): string | undefined {
  if (!sessionId) return undefined;
  const session = sessions.find(item => item.id === sessionId);
  if (!session) return undefined;
  return `Session ${session.sessionNumber}`;
}

/**
 * Collect existing reviewed evidence for a development theme from applied
 * development updates. Does not invent or rephrase evidence text.
 */
export function collectThemeEvidenceItems(
  theme: ProfileEntry,
  updates: DevelopmentUpdate[],
  sessions: Session[]
): DevelopmentThemeEvidenceItem[] {
  const items: DevelopmentThemeEvidenceItem[] = [];
  const seen = new Set<string>();

  for (const update of updates) {
    if (update.status !== "applied") continue;

    const changes: ProposedProfileChanges =
      update.appliedChanges ?? effectiveChanges(update);
    const bucket = changes.emergingThemes;
    if (!bucket) continue;

    const actions: Array<"add" | "update"> = ["add", "update"];
    for (const action of actions) {
      const rows = bucket[action] ?? [];
      rows.forEach((row, index) => {
        if (!valuesMatchTheme(theme, row)) return;
        const changeKey = `emergingThemes.${action}.${index}`;
        const linked = evidenceForChange(update.evidenceSummary, changeKey);
        for (const evidence of linked) {
          const content = (
            evidence.sourceExcerpt?.trim() ||
            evidence.evidenceText.trim()
          ).trim();
          if (!content) continue;
          const id = `${update.id}:${changeKey}:${content.slice(0, 48)}`;
          if (seen.has(id)) continue;
          seen.add(id);
          items.push({
            id,
            sourceLabel: "Approved development update",
            sessionLabel: sessionLabelFor(
              evidence.sessionId ?? update.sessionId,
              sessions
            ),
            content,
          });
        }
      });
    }
  }

  // Fall back to the theme reason stored on the approved profile entry.
  if (items.length === 0) {
    const reason = theme.reason?.trim();
    if (reason) {
      items.push({
        id: `${theme.id}:reason`,
        sourceLabel: "Approved development record",
        content: reason,
      });
    }
  }

  return items;
}

function themeFromEntry(
  entry: ProfileEntry,
  updates: DevelopmentUpdate[],
  sessions: Session[]
): DevelopmentTheme {
  const evidenceItems = collectThemeEvidenceItems(entry, updates, sessions);
  return {
    id: entry.id,
    name: entry.value,
    confidence: mapConfidence(entry.status),
    narrative:
      entry.reason?.trim() ||
      "This theme is grounded in reviewed coaching evidence and remains open to further observation.",
    evidenceCount:
      evidenceItems.length > 0
        ? evidenceItems.length
        : evidenceCountFor(entry.status),
    evidenceItems,
  };
}

function buildMilestones(
  client: Client,
  sessions: Session[]
): DevelopmentMilestone[] {
  const milestones: DevelopmentMilestone[] = [];

  for (const session of sessions) {
    if (session.status === "completed" || session.summaryStatus === "approved") {
      milestones.push({
        id: `conversation-${session.id}`,
        date: session.date || session.completedAt || "",
        title: session.title?.trim() || `Conversation ${session.sessionNumber}`,
        description:
          session.summary?.trim() ||
          session.focus?.trim() ||
          "A coaching conversation was completed and reviewed.",
        sourceType: session.summaryStatus === "approved" ? "summary" : "conversation",
      });
    }

    if (session.reflectWhatShifted?.trim() || session.reflectPrivate?.trim()) {
      milestones.push({
        id: `reflection-${session.id}`,
        date: session.date || session.completedAt || "",
        title: "Coach reflection captured",
        description:
          session.reflectDifferently?.trim() ||
          session.reflectWhatShifted?.trim() ||
          "Private reflection was recorded for this conversation.",
        sourceType: "reflection",
      });
    }
  }

  for (const action of client.actions.filter(item => item.status === "Complete")) {
    milestones.push({
      id: `commitment-${action.id}`,
      date: action.due || "",
      title: action.title,
      description: action.notes?.trim() || "Commitment completed.",
      sourceType: "commitment",
    });
  }

  return milestones
    .filter(item => item.title.trim())
    .sort((a, b) => {
      const left = a.date ? new Date(a.date).getTime() : 0;
      const right = b.date ? new Date(b.date).getTime() : 0;
      return right - left;
    })
    .slice(0, 8);
}

export function buildDevelopmentProfileViewModel(
  client: Client,
  profile: DevelopmentProfile | null,
  appliedUpdates: DevelopmentUpdate[] = []
): DevelopmentProfileViewModel {
  const strengths = profile?.strengths ?? [];
  const themes = (profile?.emergingThemes ?? []).map(entry =>
    themeFromEntry(entry, appliedUpdates, client.sessions ?? [])
  );
  const growthAreas = profile?.growthAreas ?? [];
  const focus = profile?.currentFocus?.trim() || "";
  const priorityCandidates = growthAreas
    .filter(item => item.status === "emerging" || item.status === "supported")
    .map(item => item.value);
  const distinctPriorities = filterSemanticDuplicates(priorityCandidates, [
    focus,
  ]).slice(0, 3);
  const lookingAhead = [
    ...(focus ? [`Continue exploring: ${focus}`] : []),
    ...distinctPriorities,
  ];

  const notYetEstablished = [
    ...growthAreas
      .filter(item => item.status === "emerging")
      .map(item => item.value),
    ...strengths
      .filter(item => item.status === "emerging")
      .map(item => `${item.value} is still emerging`),
  ].slice(0, 6);

  const behaviouralEvidence = [
    ...(profile?.patterns ?? []).map(item => item.value),
    ...(profile?.beliefs ?? []).map(item => item.value),
  ].slice(0, 6);

  return {
    clientName: client.name,
    currentDirection:
      profile?.currentFocus?.trim() ||
      client.currentFocus?.trim() ||
      null,
    emergingStrengths: strengths
      .filter(item => item.status !== "emerging" || strengths.length <= 3)
      .slice(0, 5)
      .map(item => item.value),
    themes: themes.slice(0, 6),
    milestones: buildMilestones(client, client.sessions),
    notYetEstablished,
    lookingAhead: lookingAhead.slice(0, 5),
    behaviouralEvidence,
  };
}
