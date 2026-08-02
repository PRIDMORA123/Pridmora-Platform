import type { Client } from "@/lib/types";
import { isClientArchived } from "@/lib/types";

export type CoachWelcome = {
  headline: string;
  detail: string;
  attention: string | null;
};

function openCommitments(client: Client): number {
  return client.actions.filter(action => action.status !== "Complete").length;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * Coaching-focused Today welcome copy, rotated from live client data.
 */
export function buildCoachWelcome(clients: Client[], coachName: string): CoachWelcome {
  const active = clients.filter(client => !isClientArchived(client));
  const conversationCount = Math.min(active.length, 2);
  const focusClient = active[0];
  const openTotal = active.reduce((sum, client) => sum + openCommitments(client), 0);

  if (!focusClient) {
    return {
      headline: `Welcome back, ${coachName}.`,
      detail: "When your next coaching conversations are scheduled, they will appear here.",
      attention: null,
    };
  }

  const focusLine = focusClient.currentFocus?.trim()
    ? `${focusClient.name} — ${focusClient.currentFocus.trim().replace(/\.$/, "")}.`
    : `${focusClient.name} is ready for the next conversation.`;

  const headlines = [
    conversationCount === 1
      ? "Today you have one coaching conversation."
      : `Today you have ${conversationCount} coaching conversations.`,
    focusLine,
    openTotal > 0
      ? `${openTotal} open ${plural(openTotal, "commitment")} need reviewing before today's sessions.`
      : "No open commitments need reviewing before today's sessions.",
  ];

  // Rotate through data-backed lines by day so the welcome stays fresh without randomness.
  const dayIndex = Math.floor(Date.now() / 86_400_000) % headlines.length;
  const headline = headlines[dayIndex] ?? headlines[0];

  const detailParts: string[] = [];
  if (dayIndex !== 0) {
    detailParts.push(
      conversationCount === 1
        ? "One conversation is ready for preparation."
        : `${conversationCount} conversations are ready for preparation.`
    );
  }
  if (dayIndex !== 1 && focusClient.currentFocus?.trim()) {
    detailParts.push(focusLine);
  }
  if (dayIndex !== 2 && openTotal > 0) {
    detailParts.push(
      `${openTotal} open ${plural(openTotal, "commitment")} to revisit before you begin.`
    );
  }

  const detail =
    detailParts.slice(0, 2).join(" ") ||
    "Prepare calmly, then enter the conversation present and clear.";

  const attention =
    openTotal > 0
      ? `${openTotal} open ${plural(openTotal, "commitment")} need reviewing before today's sessions.`
      : null;

  return { headline, detail, attention };
}
