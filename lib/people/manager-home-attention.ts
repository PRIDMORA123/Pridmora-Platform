/**
 * Compact Manager Home "Needs attention" items from existing People attention.
 * Does not invent a second dashboard or AI scoring.
 */

import {
  isSubstantivePendingDevelopmentUpdate,
  type DevelopmentUpdateReviewTask,
} from "@/lib/development-updates/types";
import { isSelfDevelopmentClientRow } from "@/lib/my-development/self-development-identity";
import {
  getPeopleAttentionRank,
  getPeopleNextActionLabel,
} from "@/lib/people/attention-order";
import { isClientArchived, type Client } from "@/lib/types";

export type ManagerHomeAttentionItem = {
  personId: string;
  personName: string;
  nextActionLabel: string;
  rank: number;
  /** When set, Needs attention should open the existing Development Update review. */
  updateId?: string;
};

export const PENDING_DEVELOPMENT_UPDATE_ATTENTION_RANK = 3;
export const PENDING_DEVELOPMENT_UPDATE_ATTENTION_LABEL =
  "Review development update";

const MAX_ATTENTION_ITEMS = 5;

/**
 * Incomplete live-conversation work must stay ahead of Apply/Discard.
 * People ranks 1–3: continue conversation, capture notes, Review Summary & Insights.
 */
const INCOMPLETE_CONVERSATION_RANK_CEILING = 3;

function pendingTaskByManagedClientId(
  clients: Client[],
  awaitingUpdates: readonly DevelopmentUpdateReviewTask[]
): Map<string, DevelopmentUpdateReviewTask> {
  const managedIds = new Set(
    clients
      .filter(
        client =>
          !isClientArchived(client) &&
          !isSelfDevelopmentClientRow({
            is_self_development: client.isSelfDevelopment ?? null,
            role: client.role,
          })
      )
      .map(client => client.id)
  );

  const byClient = new Map<string, DevelopmentUpdateReviewTask>();
  for (const task of awaitingUpdates) {
    if (!managedIds.has(task.clientId)) continue;
    if (!isSubstantivePendingDevelopmentUpdate(task.update)) continue;
    const existing = byClient.get(task.clientId);
    if (!existing) {
      byClient.set(task.clientId, task);
      continue;
    }
    const existingStamp = Date.parse(existing.update.generatedAt ?? "") || 0;
    const nextStamp = Date.parse(task.update.generatedAt ?? "") || 0;
    if (nextStamp > existingStamp) {
      byClient.set(task.clientId, task);
    }
  }
  return byClient;
}

/**
 * People whose next action already requires manager attention (ranks 1–5).
 * Quiet / no-recent-activity (rank 6) are omitted unless a ready_for_review
 * Development Update should be recovered.
 */
export function buildManagerHomeAttentionItems(
  clients: Client[],
  awaitingUpdates: readonly DevelopmentUpdateReviewTask[] = [],
  limit = MAX_ATTENTION_ITEMS
): ManagerHomeAttentionItem[] {
  const active = clients.filter(
    client =>
      !isClientArchived(client) &&
      !isSelfDevelopmentClientRow({
        is_self_development: client.isSelfDevelopment ?? null,
        role: client.role,
      })
  );
  const pendingByClient = pendingTaskByManagedClientId(active, awaitingUpdates);

  const items: ManagerHomeAttentionItem[] = [];
  for (const client of active) {
    const sessionRank = getPeopleAttentionRank(client);
    const pending = pendingByClient.get(client.id);

    if (pending && sessionRank > INCOMPLETE_CONVERSATION_RANK_CEILING) {
      items.push({
        personId: client.id,
        personName: client.name,
        nextActionLabel: PENDING_DEVELOPMENT_UPDATE_ATTENTION_LABEL,
        rank: PENDING_DEVELOPMENT_UPDATE_ATTENTION_RANK,
        updateId: pending.update.id,
      });
      continue;
    }

    if (sessionRank >= 6) continue;
    items.push({
      personId: client.id,
      personName: client.name,
      nextActionLabel: getPeopleNextActionLabel(client),
      rank: sessionRank,
    });
  }

  items.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.personName.localeCompare(b.personName, "en-GB");
  });

  return items.slice(0, limit);
}
