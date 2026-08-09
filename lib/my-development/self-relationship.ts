import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "@/lib/types";
import { isSelfDevelopmentClientRow } from "@/lib/my-development/self-development-identity";
import { createRelationshipAtomicInDb } from "@/lib/supabase/repository";
import {
  assembleClient,
  initialsFromName,
  type ClientRow,
} from "@/lib/supabase/map";

export { isSelfDevelopmentClientRow };

/**
 * Ensure the authenticated practitioner has a self-development client row
 * in the active organisation. Used for My Development evidence only —
 * never listed as a managed person.
 */
export async function ensureSelfDevelopmentRelationship(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
  fullName: string;
}): Promise<Client> {
  const organisationId = input.organisationId.trim();
  const userId = input.userId.trim();
  if (!organisationId || !userId) {
    throw new Error("Organisation and user are required for My Development.");
  }

  const existing = await findSelfDevelopmentClient(
    input.supabase,
    organisationId,
    userId
  );
  if (existing) return existing;

  const displayName = input.fullName.trim() || "My development";
  const created = await createRelationshipAtomicInDb(input.supabase, {
    organisationId,
    identityMode: "standard",
    name: displayName,
    displayLabel: "My development",
    role: "Self development",
    organisationLabel: "",
    email: "",
    currentFocus: "Personal development record",
    aiNameAllowed: false,
    initials: initialsFromName(displayName),
  });

  const { error: flagError } = await input.supabase
    .from("clients")
    .update({
      is_self_development: true,
      display_label: "My development",
      updated_at: new Date().toISOString(),
    })
    .eq("id", created.id)
    .eq("organisation_id", organisationId)
    .eq("coach_id", userId);

  if (flagError) {
    // Column may be missing pre-migration — still return the created row.
    if (!/is_self_development|schema cache|could not find/i.test(flagError.message)) {
      throw new Error(flagError.message);
    }
  }

  return {
    ...created,
    displayLabel: "My development",
    isSelfDevelopment: true,
  };
}

export async function findSelfDevelopmentClient(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string
): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("coach_id", userId)
    .eq("is_self_development", true)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    if (/is_self_development|schema cache|could not find/i.test(error.message)) {
      // Pre-migration fallback: role sentinel used only if column absent.
      const fallback = await supabase
        .from("clients")
        .select("*")
        .eq("organisation_id", organisationId)
        .eq("coach_id", userId)
        .eq("role", "Self development")
        .is("archived_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (fallback.error || !fallback.data) return null;
      return assembleClient(fallback.data as ClientRow, [], []);
    }
    throw new Error(error.message);
  }

  if (!data) return null;
  return assembleClient(data as ClientRow, [], []);
}
