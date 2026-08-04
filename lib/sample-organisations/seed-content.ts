import type { SupabaseClient } from "@supabase/supabase-js";
import { createRelationshipAtomicInDb } from "@/lib/supabase/repository";
import { updateInstallationStage } from "@/lib/sample-organisations/status";
import type { ValidatedSamplePack } from "@/lib/sample-organisations/types";

async function mapRecord(input: {
  supabase: SupabaseClient;
  installationId: string;
  recordType: string;
  recordId: string;
  packEntityKey?: string;
}): Promise<void> {
  const { error } = await input.supabase.rpc("map_sample_organisation_record", {
    p_installation_id: input.installationId,
    p_record_type: input.recordType,
    p_record_id: input.recordId,
    p_pack_entity_key: input.packEntityKey ?? null,
  });
  if (error) {
    throw new Error("Unable to map sample record.");
  }
}

export async function seedExistingSampleOrganisation(input: {
  supabase: SupabaseClient;
  userId: string;
  organisationId: string;
  installationId: string;
  pack: ValidatedSamplePack;
}): Promise<{
  relationshipIdByKey: Map<string, string>;
  sessionIdByKey: Map<string, string>;
  counts: {
    relationships: number;
    sessions: number;
    actions: number;
    developmentUpdates: number;
    intelligenceItems: number;
  };
}> {
  const relationshipIdByKey = new Map<string, string>();
  const sessionIdByKey = new Map<string, string>();

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: input.installationId,
    stage: "creating_relationships",
    status: "installing",
  });

  for (const rel of input.pack.relationships) {
    const client = await createRelationshipAtomicInDb(input.supabase, {
      organisationId: input.organisationId,
      identityMode: rel.identityMode,
      name:
        rel.identityMode === "confidential"
          ? rel.displayLabel
          : rel.name,
      displayLabel: rel.displayLabel,
      role: rel.role,
      organisationLabel: rel.organisationLabel,
      email: rel.identityMode === "confidential" ? "" : rel.email,
      currentFocus: rel.currentFocus,
      aiNameAllowed: rel.identityMode === "confidential" ? false : rel.aiNameAllowed,
      initials: rel.identityMode === "confidential"
        ? "CL"
        : rel.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("") || "NC",
    });

    relationshipIdByKey.set(rel.key, client.id);
    await mapRecord({
      supabase: input.supabase,
      installationId: input.installationId,
      recordType: "relationship",
      recordId: client.id,
      packEntityKey: rel.key,
    });

    const { data: assignment } = await input.supabase
      .from("relationship_assignments")
      .select("id")
      .eq("client_id", client.id)
      .eq("organisation_id", input.organisationId)
      .eq("status", "active")
      .eq("assignment_role", "primary")
      .maybeSingle();

    if (assignment?.id) {
      await mapRecord({
        supabase: input.supabase,
        installationId: input.installationId,
        recordType: "assignment",
        recordId: assignment.id as string,
        packEntityKey: rel.key,
      });
    }
  }

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: input.installationId,
    stage: "creating_assignments",
    status: "installing",
    counts: { relationships: relationshipIdByKey.size },
  });

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: input.installationId,
    stage: "creating_conversations",
    status: "installing",
  });

  for (const session of input.pack.sessions) {
    const clientId = relationshipIdByKey.get(session.relationshipKey);
    if (!clientId) throw new Error("Session relationship missing.");

    const sessionId = crypto.randomUUID();
    const { error } = await input.supabase.from("sessions").insert({
      id: sessionId,
      client_id: clientId,
      coach_id: input.userId,
      organisation_id: input.organisationId,
      session_number: session.sessionNumber,
      session_date: session.sessionDate,
      display_date: session.displayDate,
      display_time: session.displayTime,
      starts_at: session.startsAt,
      status: session.status,
      title: session.title,
      duration_minutes: session.durationMinutes,
      focus: session.focus,
      preparation: session.preparation,
      notes: session.notes,
      private_notes: session.privateNotes ?? "",
      emerging_themes: session.emergingThemes,
      strengths_observed: session.strengthsObserved,
      values_becoming_visible: session.valuesBecomingVisible,
      professional_identity_development: session.professionalIdentityDevelopment,
      agreed_actions: session.agreedActions,
      suggested_focus: session.suggestedFocus,
      coach_reflection: session.coachReflection,
      summary: session.summary,
      ai_summary_approved: session.aiSummaryApproved,
      completed_at: session.completedAt ?? null,
      updated_at: new Date().toISOString(),
    });

    if (error) throw new Error("Unable to create sample conversation.");

    sessionIdByKey.set(session.key, sessionId);
    await mapRecord({
      supabase: input.supabase,
      installationId: input.installationId,
      recordType: "session",
      recordId: sessionId,
      packEntityKey: session.key,
    });
  }

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: input.installationId,
    stage: "creating_actions",
    status: "installing",
    counts: { sessions: sessionIdByKey.size },
  });

  let actionCount = 0;
  for (const action of input.pack.actions) {
    const clientId = relationshipIdByKey.get(action.relationshipKey);
    const sessionId = sessionIdByKey.get(action.sessionKey);
    if (!clientId || !sessionId) throw new Error("Action references missing.");

    const actionId = crypto.randomUUID();
    const { error } = await input.supabase.from("client_items").insert({
      id: actionId,
      client_id: clientId,
      coach_id: input.userId,
      organisation_id: input.organisationId,
      session_id: sessionId,
      item_type: "action",
      title: action.title,
      detail: action.notes ?? null,
      owner: action.owner ?? null,
      status: action.status,
      event_date: action.due ?? null,
    });
    if (error) throw new Error("Unable to create sample action.");

    actionCount += 1;
    await mapRecord({
      supabase: input.supabase,
      installationId: input.installationId,
      recordType: "action",
      recordId: actionId,
      packEntityKey: action.key,
    });
  }

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: input.installationId,
    stage: "creating_development_updates",
    status: "installing",
    counts: { actions: actionCount },
  });

  const profileIdByClient = new Map<string, string>();
  let updateCount = 0;
  for (const update of input.pack.developmentUpdates) {
    const clientId = relationshipIdByKey.get(update.relationshipKey);
    const sessionId = sessionIdByKey.get(update.sessionKey);
    if (!clientId || !sessionId) throw new Error("Update references missing.");

    let profileId = profileIdByClient.get(clientId);
    if (!profileId) {
      const { data: profile, error: profileError } = await input.supabase
        .from("development_profiles")
        .upsert(
          {
            client_id: clientId,
            coach_id: input.userId,
            organisation_id: input.organisationId,
            current_focus:
              input.pack.relationships.find(r => r.key === update.relationshipKey)
                ?.currentFocus ?? null,
          },
          { onConflict: "client_id" }
        )
        .select("id")
        .single();
      if (profileError || !profile) {
        throw new Error("Unable to create development profile.");
      }
      profileId = profile.id as string;
      profileIdByClient.set(clientId, profileId);
      await mapRecord({
        supabase: input.supabase,
        installationId: input.installationId,
        recordType: "development_profile",
        recordId: profileId,
        packEntityKey: update.relationshipKey,
      });
    }

    const updateId = crypto.randomUUID();
    const { error } = await input.supabase.from("development_updates").insert({
      id: updateId,
      client_id: clientId,
      session_id: sessionId,
      coach_id: input.userId,
      organisation_id: input.organisationId,
      status: update.status,
      conversation_summary: update.conversationSummary,
      proposed_changes: update.proposedChanges,
      edited_changes: null,
      applied_changes: update.proposedChanges,
      evidence_summary: update.evidenceSummary,
      has_meaningful_changes: update.hasMeaningfulChanges,
      coach_note: update.coachNote ?? null,
      generated_at: update.generatedAt ?? new Date().toISOString(),
      reviewed_at: update.reviewedAt ?? null,
      applied_at: update.appliedAt ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Unable to create development update.");

    updateCount += 1;
    await mapRecord({
      supabase: input.supabase,
      installationId: input.installationId,
      recordType: "development_update",
      recordId: updateId,
      packEntityKey: update.key,
    });
  }

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: input.installationId,
    stage: "creating_intelligence",
    status: "installing",
    counts: { developmentUpdates: updateCount },
  });

  let intelligenceCount = 0;
  for (const item of input.pack.intelligenceItems) {
    const clientId = relationshipIdByKey.get(item.relationshipKey);
    const sessionId = sessionIdByKey.get(item.sessionKey);
    if (!clientId || !sessionId) throw new Error("Intelligence references missing.");

    const itemId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error } = await input.supabase.from("intelligence_items").insert({
      id: itemId,
      user_id: input.userId,
      client_id: clientId,
      organisation_id: input.organisationId,
      category: item.category,
      title: item.title,
      description: item.description,
      status: "approved",
      confidence_score: item.confidenceScore,
      confidence_label: item.confidenceLabel,
      source_type: item.sourceType,
      first_identified_at: item.firstIdentifiedAt ?? now,
      last_updated_at: now,
      approved_at: item.approvedAt ?? now,
      approved_by: input.userId,
      updated_at: now,
    });
    if (error) throw new Error("Unable to create intelligence item.");

    if (item.evidenceText) {
      await input.supabase.from("intelligence_evidence").insert({
        intelligence_item_id: itemId,
        session_id: sessionId,
        user_id: input.userId,
        organisation_id: input.organisationId,
        evidence_text: item.evidenceText,
        evidence_type: "coach_observation",
        occurred_at: item.firstIdentifiedAt ?? now,
        created_by: "sample_organisation",
      });
    }

    intelligenceCount += 1;
    await mapRecord({
      supabase: input.supabase,
      installationId: input.installationId,
      recordType: "intelligence_item",
      recordId: itemId,
      packEntityKey: item.key,
    });
  }

  return {
    relationshipIdByKey,
    sessionIdByKey,
    counts: {
      relationships: relationshipIdByKey.size,
      sessions: sessionIdByKey.size,
      actions: actionCount,
      developmentUpdates: updateCount,
      intelligenceItems: intelligenceCount,
    },
  };
}

