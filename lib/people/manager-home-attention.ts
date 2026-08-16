/**
 * Compact Manager Home "Needs attention" items from existing People attention.
 * Does not invent a second dashboard or AI scoring.
 */

import {
  getPeopleAttentionRank,
  getPeopleNextActionLabel,
  sortClientsByAttention,
} from "@/lib/people/attention-order";
import { isClientArchived, type Client } from "@/lib/types";

export type ManagerHomeAttentionItem = {
  personId: string;
  personName: string;
  nextActionLabel: string;
  rank: number;
};

const MAX_ATTENTION_ITEMS = 5;

/**
 * People whose next action already requires manager attention (ranks 1–5).
 * Quiet / no-recent-activity (rank 6) are omitted.
 */
export function buildManagerHomeAttentionItems(
  clients: Client[],
  limit = MAX_ATTENTION_ITEMS
): ManagerHomeAttentionItem[] {
  const active = clients.filter(client => !isClientArchived(client));
  const ordered = sortClientsByAttention(active);

  const items: ManagerHomeAttentionItem[] = [];
  for (const client of ordered) {
    const rank = getPeopleAttentionRank(client);
    if (rank >= 6) continue;
    items.push({
      personId: client.id,
      personName: client.name,
      nextActionLabel: getPeopleNextActionLabel(client),
      rank,
    });
    if (items.length >= limit) break;
  }
  return items;
}
