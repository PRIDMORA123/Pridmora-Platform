/**
 * Safe cleanup for disposable auth test users.
 *
 * Blocking constraint (not transient):
 *   public.organisations.created_by → auth.users(id)
 *   has no ON DELETE action (defaults to NO ACTION / RESTRICT).
 * Personal workspaces created by ensure_personal_organisation therefore
 * block GoTrue admin deleteUser with HTTP 500 until those rows are removed.
 *
 * Safety rules:
 * - Delete only personal organisations created_by the target user.
 * - Never delete shared (non-personal) organisations.
 * - Never delete records owned by other users.
 * - Log safe IDs and table counts only (no tokens / emails beyond user id).
 */

const DEFAULT_RETRY = {
  attempts: 4,
  baseDelayMs: 200,
  maxDelayMs: 2000,
};

const CONTENT_TABLES_BY_ORG = [
  "clients",
  "sessions",
  "client_items",
  "coaching_reports",
  "development_reports",
  "development_profiles",
  "development_updates",
  "coaching_moments",
  "intelligence_items",
  "intelligence_evidence",
  "session_intelligence_reviews",
  "question_insights",
  "person_progress_signals",
  "intelligence_audit_log",
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableAuthError(error) {
  if (!error) return false;
  const status = error.status ?? error.statusCode ?? null;
  const name = error.name || "";
  const message = String(error.message || "");
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  // Opaque AuthRetryableFetchError/500 often means network flake after
  // dependents are gone. FK violations are prevented by pre-delete; if they
  // remain, verifyDisposableUserCleanup / orphan inspection surfaces them.
  if (name === "AuthRetryableFetchError" && (status === 500 || status == null)) {
    return true;
  }
  if (/fetch failed|network|ECONNRESET|ETIMEDOUT|socket/i.test(message)) {
    return true;
  }
  return false;
}

/**
 * Bounded exponential backoff for Auth Admin deleteUser.
 */
export async function deleteAuthUserWithRetry(
  admin,
  userId,
  options = DEFAULT_RETRY
) {
  const attempts = options.attempts ?? DEFAULT_RETRY.attempts;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs;

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { data, error } = await admin.auth.admin.deleteUser(userId);
    if (!error) {
      return { deleted: true, attempts: attempt, data: data ?? null };
    }
    lastError = error;
    const retryable = isRetryableAuthError(error) && attempt < attempts;
    if (!retryable) break;
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    await sleep(delay);
  }

  const err = new Error("QA_AUTH_USER_DELETE_FAILED");
  err.code = "QA_AUTH_USER_DELETE_FAILED";
  err.safeDetails = {
    userId,
    status: lastError?.status ?? null,
    name: lastError?.name ?? null,
    message: String(lastError?.message || "").slice(0, 120),
  };
  throw err;
}

async function countEq(admin, table, column, value) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    // Missing optional tables should not abort cleanup.
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
      return 0;
    }
    throw error;
  }
  return count ?? 0;
}

async function deleteEq(admin, table, column, value) {
  const { data, error } = await admin
    .from(table)
    .delete()
    .eq(column, value)
    .select("id");
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
      return 0;
    }
    throw error;
  }
  return data?.length ?? 0;
}

async function nullEq(admin, table, column, value) {
  const { data, error } = await admin
    .from(table)
    .update({ [column]: null })
    .eq(column, value)
    .select("id");
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
      return 0;
    }
    throw error;
  }
  return data?.length ?? 0;
}

/**
 * Personal organisations owned by the disposable user that are safe to remove.
 */
export async function listDeletablePersonalOrganisations(admin, userId) {
  const { data: owned, error } = await admin
    .from("organisations")
    .select("id, organisation_type, created_by, status")
    .eq("created_by", userId);

  if (error) throw error;

  const sharedOwned = (owned || []).filter(
    row => row.organisation_type !== "personal"
  );
  if (sharedOwned.length) {
    const err = new Error("QA_CLEANUP_REFUSES_SHARED_ORG");
    err.code = "QA_CLEANUP_REFUSES_SHARED_ORG";
    err.safeDetails = {
      userId,
      organisationIds: sharedOwned.map(row => row.id),
    };
    throw err;
  }

  const personal = (owned || []).filter(
    row => row.organisation_type === "personal"
  );
  const deletable = [];

  for (const org of personal) {
    const { data: members, error: memberError } = await admin
      .from("organisation_memberships")
      .select("id, user_id, role, status")
      .eq("organisation_id", org.id);

    if (memberError) throw memberError;

    const foreignMembers = (members || []).filter(
      member => member.user_id !== userId
    );
    if (foreignMembers.length) {
      const err = new Error("QA_CLEANUP_REFUSES_SHARED_MEMBERSHIP");
      err.code = "QA_CLEANUP_REFUSES_SHARED_MEMBERSHIP";
      err.safeDetails = {
        userId,
        organisationId: org.id,
        foreignMemberCount: foreignMembers.length,
      };
      throw err;
    }

    deletable.push({
      id: org.id,
      organisation_type: org.organisation_type,
      memberCount: (members || []).length,
    });
  }

  return deletable;
}

async function deletePersonalOrganisationTree(admin, userId, orgId, counts) {
  // Content tables reference organisations(id) without ON DELETE — clear
  // coach-owned rows first. Scope by coach_id where present so other users'
  // rows are never touched.
  const coachScoped = [
    "clients",
    "sessions",
    "client_items",
    "coaching_reports",
    "development_reports",
    "development_profiles",
    "development_updates",
    "coaching_moments",
  ];

  for (const table of coachScoped) {
    const { data, error } = await admin
      .from(table)
      .delete()
      .eq("organisation_id", orgId)
      .eq("coach_id", userId)
      .select("id");
    if (error) {
      if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
        continue;
      }
      // Some tables may lack coach_id; fall through to org-only delete only
      // when the org is confirmed personal and sole-owned.
      if (/coach_id|column/i.test(error.message)) {
        const deleted = await deleteEq(admin, table, "organisation_id", orgId);
        counts[table] = (counts[table] || 0) + deleted;
        continue;
      }
      throw error;
    }
    counts[table] = (counts[table] || 0) + (data?.length ?? 0);
  }

  for (const table of CONTENT_TABLES_BY_ORG) {
    if (coachScoped.includes(table)) continue;
    const deleted = await deleteEq(admin, table, "organisation_id", orgId);
    counts[table] = (counts[table] || 0) + deleted;
  }

  counts.organisation_invitations =
    (counts.organisation_invitations || 0) +
    (await deleteEq(admin, "organisation_invitations", "organisation_id", orgId));

  counts.relationship_assignments =
    (counts.relationship_assignments || 0) +
    (await deleteEq(admin, "relationship_assignments", "organisation_id", orgId));

  counts.organisation_audit_log =
    (counts.organisation_audit_log || 0) +
    (await deleteEq(admin, "organisation_audit_log", "organisation_id", orgId));

  // Clear profile pointers before org delete (ON DELETE SET NULL exists, but
  // clear explicitly for the disposable user).
  const { error: profileClearError } = await admin
    .from("profiles")
    .update({ current_organisation_id: null })
    .eq("id", userId)
    .eq("current_organisation_id", orgId);
  if (profileClearError) throw profileClearError;

  counts.organisation_memberships =
    (counts.organisation_memberships || 0) +
    (await deleteEq(admin, "organisation_memberships", "organisation_id", orgId));

  const { data: deletedOrgs, error: orgDeleteError } = await admin
    .from("organisations")
    .delete()
    .eq("id", orgId)
    .eq("created_by", userId)
    .eq("organisation_type", "personal")
    .select("id");
  if (orgDeleteError) throw orgDeleteError;
  counts.organisations =
    (counts.organisations || 0) + (deletedOrgs?.length ?? 0);
}

/**
 * Delete test-owned dependents in dependency order, then the auth user.
 */
export async function cleanupDisposableAuthUser(admin, userId, options = {}) {
  if (!userId) {
    throw new Error("cleanupDisposableAuthUser requires userId");
  }

  const log =
    options.log ||
    ((message, details) => {
      console.log(message, details ? JSON.stringify(details) : "");
    });

  const counts = {};
  const personalOrgs = await listDeletablePersonalOrganisations(admin, userId);
  log("cleanup: personal organisations", {
    userId,
    count: personalOrgs.length,
    organisationIds: personalOrgs.map(org => org.id),
  });

  for (const org of personalOrgs) {
    await deletePersonalOrganisationTree(admin, userId, org.id, counts);
  }

  // Remaining memberships on shared orgs: remove only this user's rows.
  counts.organisation_memberships_user =
    await deleteEq(admin, "organisation_memberships", "user_id", userId);

  // Restrict-style nullable / invitation pointers that can still block auth delete.
  counts.organisation_invitations_invited_by =
    await deleteEq(admin, "organisation_invitations", "invited_by", userId);
  counts.organisation_invitations_accepted_by = await nullEq(
    admin,
    "organisation_invitations",
    "accepted_by",
    userId
  );
  counts.relationship_assignments_assigned_by = await nullEq(
    admin,
    "relationship_assignments",
    "assigned_by",
    userId
  );
  counts.organisation_memberships_invited_by = await nullEq(
    admin,
    "organisation_memberships",
    "invited_by",
    userId
  );

  // Profile cascades from auth.users, but removing it early avoids
  // current_organisation_id edge cases if any org row survived.
  counts.profiles = await deleteEq(admin, "profiles", "id", userId);

  log("cleanup: dependent counts", { userId, counts });

  try {
    const authResult = await deleteAuthUserWithRetry(admin, userId, options.retry);
    log("cleanup: auth user deleted", {
      userId,
      attempts: authResult.attempts,
    });
    return {
      userId,
      personalOrganisationIds: personalOrgs.map(org => org.id),
      counts,
      auth: authResult,
    };
  } catch (error) {
    const blockingOrgs = await countEq(admin, "organisations", "created_by", userId);
    if (error && typeof error === "object") {
      error.safeDetails = {
        ...(error.safeDetails || {}),
        userId,
        organisations_created_by_remaining: blockingOrgs,
        blocker:
          blockingOrgs > 0
            ? DISPOSABLE_USER_DELETE_BLOCKER
            : { note: "no organisations.created_by rows remain; likely transient Auth failure" },
      };
    }
    throw error;
  }
}

/**
 * Verify no orphan organisation / membership / profile rows remain for userId.
 */
export async function verifyDisposableUserCleanup(admin, userId) {
  const { data: authData, error: authError } =
    await admin.auth.admin.getUserById(userId);

  const remaining = {
    authUser: !authError && Boolean(authData?.user) ? 1 : 0,
    profiles: await countEq(admin, "profiles", "id", userId),
    organisations_created_by: await countEq(
      admin,
      "organisations",
      "created_by",
      userId
    ),
    organisation_memberships: await countEq(
      admin,
      "organisation_memberships",
      "user_id",
      userId
    ),
    relationship_assignments: await countEq(
      admin,
      "relationship_assignments",
      "user_id",
      userId
    ),
    clients_coach_id: await countEq(admin, "clients", "coach_id", userId),
  };

  const orphanCount = Object.values(remaining).reduce((sum, n) => sum + n, 0);
  if (orphanCount > 0) {
    const err = new Error("QA_DISPOSABLE_USER_ORPHANS");
    err.code = "QA_DISPOSABLE_USER_ORPHANS";
    err.safeDetails = { userId, remaining };
    throw err;
  }

  return remaining;
}

export const DISPOSABLE_USER_DELETE_BLOCKER = {
  table: "organisations",
  column: "created_by",
  references: "auth.users(id)",
  onDelete: "NO ACTION (default RESTRICT)",
  cause:
    "Personal organisations created by ensure_personal_organisation / profile insert trigger retain created_by pointing at the auth user, so admin deleteUser fails until those rows are deleted.",
  trigger:
    "on_profile_ensure_organisation → handle_new_user_organisation → ensure_personal_organisation",
};
