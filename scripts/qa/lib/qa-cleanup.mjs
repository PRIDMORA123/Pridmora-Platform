/**
 * Dependency-safe cleanup for records created by this QA run only.
 */
import { deleteAuthUsers } from "./qa-auth.mjs";

export async function cleanupFixtures(context) {
  const admin = context.admin;
  const runId = context.runId;
  const summary = {
    moments: 0,
    updates: 0,
    sessions: 0,
    profiles: 0,
    clients: 0,
    authUsers: 0,
  };

  const relationshipIds = [...new Set(context.createdRelationshipIds)];
  const sessionIds = [...new Set(context.createdSessionIds)];
  const updateIds = [...new Set(context.createdUpdateIds)];
  const momentIds = [...new Set(context.createdMomentIds)];
  const authUserIds = [...new Set(context.createdAuthUserIds)];

  // Moments
  if (momentIds.length) {
    const { data } = await admin
      .from("coaching_moments")
      .delete()
      .in("id", momentIds)
      .select("id");
    summary.moments += data?.length || 0;
  }
  if (relationshipIds.length) {
    const { data } = await admin
      .from("coaching_moments")
      .delete()
      .in("client_id", relationshipIds)
      .select("id");
    summary.moments += data?.length || 0;
  }

  // Development updates
  if (updateIds.length) {
    const { data } = await admin
      .from("development_updates")
      .delete()
      .in("id", updateIds)
      .select("id");
    summary.updates += data?.length || 0;
  }
  if (relationshipIds.length) {
    const { data } = await admin
      .from("development_updates")
      .delete()
      .in("client_id", relationshipIds)
      .select("id");
    summary.updates += data?.length || 0;
  }

  // Development profiles
  if (relationshipIds.length) {
    const { data } = await admin
      .from("development_profiles")
      .delete()
      .in("client_id", relationshipIds)
      .select("id");
    summary.profiles += data?.length || 0;
  }

  // Optional audit rows if table exists
  try {
    if (relationshipIds.length) {
      await admin
        .from("development_update_audit")
        .delete()
        .in("client_id", relationshipIds);
    }
  } catch {
    // table may not exist
  }

  // Sessions
  if (sessionIds.length) {
    const { data } = await admin
      .from("sessions")
      .delete()
      .in("id", sessionIds)
      .select("id");
    summary.sessions += data?.length || 0;
  }
  if (relationshipIds.length) {
    const { data } = await admin
      .from("sessions")
      .delete()
      .in("client_id", relationshipIds)
      .select("id");
    summary.sessions += data?.length || 0;
  }

  // Clients / relationships
  if (relationshipIds.length) {
    const { data } = await admin
      .from("clients")
      .delete()
      .in("id", relationshipIds)
      .select("id");
    summary.clients += data?.length || 0;
  }

  // Auth users created by this run
  summary.authUsers = await deleteAuthUsers(admin, authUserIds);

  context.cleanupSummary = { ...summary, runId };
  return summary;
}

export async function verifyCleanup(context) {
  const admin = context.admin;
  const relationshipIds = [...new Set(context.createdRelationshipIds)];
  const sessionIds = [...new Set(context.createdSessionIds)];
  const updateIds = [...new Set(context.createdUpdateIds)];
  const authUserIds = [...new Set(context.createdAuthUserIds)];

  const remaining = {
    relationships: 0,
    sessions: 0,
    updates: 0,
    authUsers: 0,
  };

  if (relationshipIds.length) {
    const { data } = await admin
      .from("clients")
      .select("id")
      .in("id", relationshipIds);
    remaining.relationships = data?.length || 0;
  }
  if (sessionIds.length) {
    const { data } = await admin
      .from("sessions")
      .select("id")
      .in("id", sessionIds);
    remaining.sessions = data?.length || 0;
  }
  if (updateIds.length) {
    const { data } = await admin
      .from("development_updates")
      .select("id")
      .in("id", updateIds);
    remaining.updates = data?.length || 0;
  }
  for (const userId of authUserIds) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (!error && data?.user) remaining.authUsers += 1;
  }

  if (
    remaining.relationships ||
    remaining.sessions ||
    remaining.updates ||
    remaining.authUsers
  ) {
    const error = new Error("QA_CLEANUP_INCOMPLETE");
    error.code = "QA_CLEANUP_INCOMPLETE";
    error.safeDetails = remaining;
    throw error;
  }

  return remaining;
}
