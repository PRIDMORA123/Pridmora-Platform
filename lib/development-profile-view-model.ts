import type { Client, Session } from "@/lib/types";
import type {
  DevelopmentProfile,
  ProfileEntry,
  ProfileEntryStatus,
} from "@/lib/development-updates/types";
import type {
  DevelopmentMilestone,
  DevelopmentProfileViewModel,
  DevelopmentTheme,
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

function themeFromEntry(entry: ProfileEntry): DevelopmentTheme {
  return {
    id: entry.id,
    name: entry.value,
    confidence: mapConfidence(entry.status),
    narrative:
      entry.reason?.trim() ||
      "This theme is grounded in reviewed coaching evidence and remains open to further observation.",
    evidenceCount: evidenceCountFor(entry.status),
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
  profile: DevelopmentProfile | null
): DevelopmentProfileViewModel {
  const strengths = profile?.strengths ?? [];
  const themes = (profile?.emergingThemes ?? []).map(themeFromEntry);
  const growthAreas = profile?.growthAreas ?? [];
  const lookingAhead = [
    ...(profile?.currentFocus?.trim()
      ? [`Continue exploring: ${profile.currentFocus.trim()}`]
      : []),
    ...growthAreas
      .filter(item => item.status === "emerging" || item.status === "supported")
      .slice(0, 3)
      .map(item => item.value),
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
