import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Write a platform audit event with safe operational metadata only.
 * Never include conversation text, reflections, notes, or AI content.
 */
export async function writePlatformAudit(input: {
  supabase: SupabaseClient;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  organisationId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const metadata = sanitiseAuditMetadata(input.metadata ?? {});
  const { error } = await input.supabase.from("platform_audit_events").insert({
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    organisation_id: input.organisationId ?? null,
    metadata,
  });

  if (error) {
    console.error("Unable to write platform audit event:", error.message);
  }
}

const FORBIDDEN_METADATA_KEYS = [
  "notes",
  "private_notes",
  "privateNotes",
  "summary",
  "summary_text",
  "summaryText",
  "conversation",
  "conversation_text",
  "reflection",
  "coaching_content",
  "ai_output",
  "password",
  "token",
  "cvv",
  "card_number",
  "pan",
];

export function sanitiseAuditMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      continue;
    }
    if (typeof value === "string" && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`;
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 50).map(item =>
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean" ||
        item === null
          ? item
          : "[object]"
      );
    }
  }
  return out;
}
