#!/usr/bin/env node
/**
 * Pilot-only disposable Customer #1 Manager onboarding rehearsal.
 *
 * Proves the real Manager invitation → authenticated accept RPC →
 * persisted membership path in the Pilot project only.
 *
 * Uses .env.pilot.local exclusively. Never prints secrets, passwords,
 * or invitation tokens. Does not mutate IDENTITY, production, Customer #1
 * production data, platform_owners, or the Customer #1 Rehearsal organisation.
 *
 * Writes require CUSTOMER1_MANAGER_REHEARSAL=1 in the process environment.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PILOT_REF = "jfcxnkmflfzzxqovkuqw";
const IDENTITY_REF = "lxfdhnwjmtfbawznivbu";
const PILOT_HOST = `${PILOT_REF}.supabase.co`;
const REHEARSAL_ORG_NAME = "Customer #1 Rehearsal";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FULL_NAME = "Customer One Manager Rehearsal";
const JOB_TITLE = "Rehearsal Manager";

function loadPilotEnv() {
  const path = resolve(process.cwd(), ".env.pilot.local");
  if (!existsSync(path)) {
    throw new Error("Missing .env.pilot.local");
  }
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function assertPilot(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("TARGET_GATE_FAIL invalid NEXT_PUBLIC_SUPABASE_URL");
  }
  if (host !== PILOT_HOST) {
    throw new Error(`TARGET_GATE_FAIL host=${host}`);
  }
  if (host.includes(IDENTITY_REF) || url.includes(IDENTITY_REF)) {
    throw new Error("IDENTITY_TOUCH_FORBIDDEN");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Missing Pilot Auth keys");
  }
}

function requireWriteGate() {
  if (process.env.CUSTOMER1_MANAGER_REHEARSAL !== "1") {
    throw new Error("WRITE_GATE_FAIL CUSTOMER1_MANAGER_REHEARSAL is not 1");
  }
}

function makePassword(label) {
  return `Prid-${label}-${randomBytes(12).toString("base64url")}!9`;
}

function generateInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function asRpcPayload(data) {
  if (data == null) return null;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof data === "object") return data;
  return null;
}

function safeError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[REDACTED_JWT]")
    .replace(/(service_role|anon|apikey|authorization)=([^&\s"']+)/gi, "$1=[REDACTED]")
    .replace(/password=[^&\s"']+/gi, "password=[REDACTED]")
    .replace(/invitation_token=[^&\s"']+/gi, "invitation_token=[REDACTED]")
    .replace(/token_hash=[^&\s"']+/gi, "token_hash=[REDACTED]")
    .replace(/token=[^&\s"']+/gi, "token=[REDACTED]")
    .slice(0, 400);
}

function alreadyGone(error) {
  if (!error) return true;
  const message = String(error.message ?? "").toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("user not found") ||
    error.code === "PGRST116" ||
    Object.keys(error).length === 0
  );
}

function createAnonClient(env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveRehearsalOrganisation(admin) {
  const { data, error } = await admin
    .from("organisations")
    .select(
      "id, name, status, licence_status, practitioner_seats_purchased"
    )
    .eq("name", REHEARSAL_ORG_NAME);

  if (error) {
    throw new Error(`REHEARSAL_ORG_LOOKUP_FAIL ${error.message}`);
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    throw new Error("REHEARSAL_ORG_NOT_FOUND");
  }
  if (rows.length !== 1) {
    throw new Error(`REHEARSAL_ORG_NOT_UNIQUE count=${rows.length}`);
  }

  const org = rows[0];
  if (org.status === "archived" || org.status === "pending_closure") {
    throw new Error(`REHEARSAL_ORG_STATUS_BLOCKED status=${org.status}`);
  }

  const licenceStatus = org.licence_status ?? "";
  if (licenceStatus !== "active" && licenceStatus !== "trial") {
    throw new Error(`REHEARSAL_LICENCE_BLOCKED status=${licenceStatus}`);
  }

  const seatsPurchased = Math.max(0, Number(org.practitioner_seats_purchased ?? 0));
  const { count: seatsInUse, error: seatError } = await admin
    .from("organisation_memberships")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", org.id)
    .eq("status", "active")
    .eq("role", "practitioner");
  if (seatError) {
    throw new Error(`REHEARSAL_SEAT_LOOKUP_FAIL ${seatError.message}`);
  }

  const seatsAvailable = seatsPurchased - (seatsInUse ?? 0);
  if (seatsAvailable < 1) {
    throw new Error(
      `REHEARSAL_NO_SEAT_AVAILABLE purchased=${seatsPurchased} in_use=${seatsInUse ?? 0}`
    );
  }

  return {
    id: org.id,
    name: org.name,
    licenceStatus,
    seatsAvailable,
  };
}

async function resolveInvitedBy(admin, organisationId) {
  const { data: owners, error: ownerError } = await admin
    .from("platform_owners")
    .select("user_id, status")
    .eq("status", "active");
  if (ownerError) {
    throw new Error(`INVITED_BY_LOOKUP_FAIL ${ownerError.message}`);
  }

  const candidateIds = [];
  for (const row of owners ?? []) {
    const userId = row.user_id;
    if (!userId) continue;
    const authUser = await admin.auth.admin.getUserById(userId);
    if (authUser.error || !authUser.data?.user?.id) continue;
    candidateIds.push(userId);
  }

  const uniqueCandidates = [...new Set(candidateIds)];
  if (uniqueCandidates.length === 1) {
    return uniqueCandidates[0];
  }
  if (uniqueCandidates.length === 0) {
    throw new Error("INVITED_BY_UNRESOLVED no active Pilot platform owner");
  }

  const { data: organisation, error: organisationError } = await admin
    .from("organisations")
    .select("created_by")
    .eq("id", organisationId)
    .maybeSingle();

  if (organisationError) {
    throw new Error(`INVITED_BY_ORG_LOOKUP_FAIL ${organisationError.message}`);
  }

  if (
    organisation?.created_by &&
    uniqueCandidates.includes(organisation.created_by)
  ) {
    return organisation.created_by;
  }

  const { data: priorInvites, error: inviteError } = await admin
    .from("organisation_invitations")
    .select("invited_by")
    .eq("organisation_id", organisationId)
    .eq("role", "practitioner")
    .eq("professional_role", "manager");
  if (inviteError) {
    throw new Error(`INVITED_BY_PRIOR_LOOKUP_FAIL ${inviteError.message}`);
  }

  const priorActors = new Set(
    (priorInvites ?? []).map((row) => row.invited_by).filter(Boolean)
  );
  const established = uniqueCandidates.filter((id) => priorActors.has(id));
  if (established.length === 1) {
    return established[0];
  }

  throw new Error(
    `INVITED_BY_UNRESOLVED ambiguous_owners=${uniqueCandidates.length} established=${established.length}`
  );
}

async function captureAutoCreatedRecords(admin, userId, rehearsalOrgId) {
  const captured = {
    profileId: null,
    personalOrganisationIds: [],
    personalMembershipIds: [],
  };

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    throw new Error(`PROFILE_CAPTURE_FAIL ${profileError.message}`);
  }
  if (profile?.id) captured.profileId = profile.id;

  const { data: personalOrgs, error: orgError } = await admin
    .from("organisations")
    .select("id, organisation_type, created_by")
    .eq("created_by", userId)
    .eq("organisation_type", "personal");
  if (orgError) {
    throw new Error(`PERSONAL_ORG_CAPTURE_FAIL ${orgError.message}`);
  }

  for (const org of personalOrgs ?? []) {
    if (!org?.id || org.id === rehearsalOrgId) {
      throw new Error("PERSONAL_ORG_CAPTURE_REFUSES_REHEARSAL_ORG");
    }
    const { data: members, error: memberError } = await admin
      .from("organisation_memberships")
      .select("id, user_id")
      .eq("organisation_id", org.id);
    if (memberError) {
      throw new Error(`PERSONAL_MEMBERSHIP_CAPTURE_FAIL ${memberError.message}`);
    }
    const foreign = (members ?? []).filter((row) => row.user_id !== userId);
    if (foreign.length) {
      throw new Error("PERSONAL_ORG_NOT_SOLE_OWNED");
    }
    captured.personalOrganisationIds.push(org.id);
    for (const row of members ?? []) {
      if (row.id) captured.personalMembershipIds.push(row.id);
    }
  }

  return captured;
}

async function loadAuthenticatedContext(client, userId, organisationId) {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("current_organisation_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    throw new Error(`AUTH_PROFILE_READ_FAIL ${profileError.message}`);
  }

  const { data: membership, error: membershipError } = await client
    .from("organisation_memberships")
    .select("id, organisation_id, role, professional_role, status")
    .eq("user_id", userId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (membershipError) {
    throw new Error(`AUTH_MEMBERSHIP_READ_FAIL ${membershipError.message}`);
  }

  return {
    currentOrganisationId: profile?.current_organisation_id ?? null,
    membership: membership ?? null,
  };
}

async function deleteCapturedRow(admin, table, id, extraEq = {}) {
  if (!id) return { ok: true, skipped: true };
  let query = admin.from(table).delete().eq("id", id);
  for (const [column, value] of Object.entries(extraEq)) {
    query = query.eq(column, value);
  }
  const { error } = await query;
  if (error && !alreadyGone(error)) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

async function deleteAuthUser(admin, userId) {
  let deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) {
    deleted = await admin.auth.admin.deleteUser(userId, true);
  }
  return alreadyGone(deleted.error);
}

async function cleanupCreated(admin, created, rehearsalOrgId) {
  const failures = [];

  for (const auditId of created.auditLogIds) {
    const result = await deleteCapturedRow(admin, "organisation_audit_log", auditId, {
      organisation_id: rehearsalOrgId,
    });
    if (!result.ok) failures.push(`audit:${result.message}`);
  }

  const membershipResult = await deleteCapturedRow(
    admin,
    "organisation_memberships",
    created.rehearsalMembershipId,
    {
      user_id: created.userId,
      organisation_id: rehearsalOrgId,
    }
  );
  if (!membershipResult.ok) failures.push(`membership:${membershipResult.message}`);

  const invitationResult = await deleteCapturedRow(
    admin,
    "organisation_invitations",
    created.invitationId,
    { organisation_id: rehearsalOrgId }
  );
  if (!invitationResult.ok) failures.push(`invitation:${invitationResult.message}`);

  for (const membershipId of created.personalMembershipIds) {
    const result = await deleteCapturedRow(
      admin,
      "organisation_memberships",
      membershipId,
      { user_id: created.userId }
    );
    if (!result.ok) failures.push(`personal_membership:${result.message}`);
  }

  for (const orgId of created.personalOrganisationIds) {
    if (orgId === rehearsalOrgId) {
      failures.push("personal_org:refused_rehearsal_org");
      continue;
    }
    const { data: org, error: orgReadError } = await admin
      .from("organisations")
      .select("id, organisation_type, created_by, name")
      .eq("id", orgId)
      .maybeSingle();
    if (orgReadError) {
      failures.push(`personal_org_read:${orgReadError.message}`);
      continue;
    }
    if (!org) continue;
    if (
      org.name === REHEARSAL_ORG_NAME ||
      org.organisation_type !== "personal" ||
      org.created_by !== created.userId
    ) {
      failures.push("personal_org:guard_refused");
      continue;
    }
    const { error: orgDeleteError } = await admin
      .from("organisations")
      .delete()
      .eq("id", orgId)
      .eq("created_by", created.userId)
      .eq("organisation_type", "personal");
    if (orgDeleteError && !alreadyGone(orgDeleteError)) {
      failures.push(`personal_org:${orgDeleteError.message}`);
    }
  }

  if (created.profileId && created.profileId === created.userId) {
    const profileResult = await deleteCapturedRow(admin, "profiles", created.profileId, {
      id: created.userId,
    });
    if (!profileResult.ok) failures.push(`profile:${profileResult.message}`);
  }

  if (created.userId) {
    const gone = await deleteAuthUser(admin, created.userId);
    if (!gone) failures.push("auth_user:deleteUser failed");
  }

  return failures;
}

async function main() {
  const report = {
    source: "customer_1_manager_rehearsal",
    target: null,
    organisation: null,
    invitationAccepted: null,
    membershipRole: null,
    professionalRole: null,
    currentOrganisation: null,
    signInAgain: null,
    rolePersisted: null,
    identityUntouched: true,
    cleanup: null,
    outcome: "FAIL",
  };

  const created = {
    userId: null,
    invitationId: null,
    rehearsalMembershipId: null,
    profileId: null,
    personalOrganisationIds: [],
    personalMembershipIds: [],
    auditLogIds: [],
  };

  let admin = null;
  let anon = null;
  let rehearsalOrgId = null;
  let invitationToken = null;

  try {
    const env = loadPilotEnv();
    assertPilot(env);
    report.target = PILOT_HOST;

    admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    anon = createAnonClient(env);

    const organisation = await resolveRehearsalOrganisation(admin);
    rehearsalOrgId = organisation.id;
    report.organisation = { id: organisation.id, name: organisation.name };

    const invitedBy = await resolveInvitedBy(admin, organisation.id);
    requireWriteGate();

    const stamp = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
    const email = `c1.manager.rehearsal.${stamp}@pridmora-pilot.test`;
    const password = makePassword("mgr");

    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: FULL_NAME,
        professional_title: JOB_TITLE,
        purpose: "customer-1-manager-rehearsal",
      },
    });
    if (createdUser.error || !createdUser.data.user?.id) {
      throw new Error(`createUser failed: ${createdUser.error?.message || "unknown"}`);
    }
    created.userId = createdUser.data.user.id;

    const autoCreated = await captureAutoCreatedRecords(
      admin,
      created.userId,
      organisation.id
    );
    created.profileId = autoCreated.profileId;
    created.personalOrganisationIds = autoCreated.personalOrganisationIds;
    created.personalMembershipIds = autoCreated.personalMembershipIds;

    const { token, tokenHash } = generateInvitationToken();
    invitationToken = token;
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    const invitationInsert = await admin.from("organisation_invitations").insert({
      organisation_id: organisation.id,
      email,
      role: "practitioner",
      professional_role: "manager",
      status: "pending",
      full_name: FULL_NAME,
      job_title: JOB_TITLE,
      token_hash: tokenHash,
      invited_by: invitedBy,
      expires_at: expiresAt,
    }).select("id").single();
    if (invitationInsert.error || !invitationInsert.data?.id) {
      throw new Error(
        `invitation insert failed: ${invitationInsert.error?.message || "unknown"}`
      );
    }
    created.invitationId = invitationInsert.data.id;

    const signIn = await anon.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.user?.id) {
      throw new Error(`signInWithPassword failed: ${signIn.error?.message || "unknown"}`);
    }
    if (signIn.data.user.id !== created.userId) {
      throw new Error("signIn user mismatch");
    }

    const accepted = await anon.rpc("accept_organisation_invitation", {
      invitation_token: invitationToken,
    });
    invitationToken = null;
    if (accepted.error) {
      throw new Error(`accept RPC failed: ${accepted.error.message}`);
    }
    const payload = asRpcPayload(accepted.data);
    if (!payload || payload.ok !== true) {
      throw new Error(`accept RPC not ok code=${payload?.code || "unknown"}`);
    }
    if (payload.role !== "practitioner") {
      throw new Error(`accept role mismatch role=${payload.role || "null"}`);
    }
    if (payload.professional_role !== "manager") {
      throw new Error(
        `accept professional_role mismatch role=${payload.professional_role || "null"}`
      );
    }
    if (payload.organisation_id !== organisation.id) {
      throw new Error("accept organisation_id mismatch");
    }
    report.invitationAccepted = true;
    created.rehearsalMembershipId = payload.membership_id ?? null;

    const { data: invitationRow, error: invitationReadError } = await admin
      .from("organisation_invitations")
      .select("id, status")
      .eq("id", created.invitationId)
      .maybeSingle();
    if (invitationReadError) {
      throw new Error(`invitation status read failed: ${invitationReadError.message}`);
    }
    if (invitationRow?.status !== "accepted") {
      throw new Error(`invitation status=${invitationRow?.status || "missing"}`);
    }

    const { data: membershipRow, error: membershipReadError } = await admin
      .from("organisation_memberships")
      .select("id, organisation_id, user_id, role, professional_role, status")
      .eq("user_id", created.userId)
      .eq("organisation_id", organisation.id)
      .maybeSingle();
    if (membershipReadError) {
      throw new Error(`membership read failed: ${membershipReadError.message}`);
    }
    if (!membershipRow?.id) {
      throw new Error("membership missing after accept");
    }
    if (membershipRow.status !== "active") {
      throw new Error(`membership status=${membershipRow.status}`);
    }
    if (membershipRow.role !== "practitioner") {
      throw new Error(`membership role=${membershipRow.role}`);
    }
    if (membershipRow.professional_role !== "manager") {
      throw new Error(`membership professional_role=${membershipRow.professional_role}`);
    }
    created.rehearsalMembershipId = membershipRow.id;
    report.membershipRole = membershipRow.role;
    report.professionalRole = membershipRow.professional_role;

    const { data: profileRow, error: profileReadError } = await admin
      .from("profiles")
      .select("id, current_organisation_id")
      .eq("id", created.userId)
      .maybeSingle();
    if (profileReadError) {
      throw new Error(`profile read failed: ${profileReadError.message}`);
    }
    if (profileRow?.id) created.profileId = profileRow.id;
    if (profileRow?.current_organisation_id !== organisation.id) {
      throw new Error("profile current_organisation_id mismatch");
    }
    report.currentOrganisation = profileRow.current_organisation_id;

    const { data: auditRows, error: auditError } = await admin
      .from("organisation_audit_log")
      .select("id")
      .eq("organisation_id", organisation.id)
      .eq("actor_user_id", created.userId)
      .eq("action", "member_joined")
      .eq("entity_id", membershipRow.id);
    if (auditError) {
      throw new Error(`audit capture failed: ${auditError.message}`);
    }
    created.auditLogIds = (auditRows ?? []).map((row) => row.id).filter(Boolean);

    await anon.auth.signOut();
    const signInAgain = await anon.auth.signInWithPassword({ email, password });
    if (signInAgain.error || !signInAgain.data.user?.id) {
      throw new Error(
        `sign-in again failed: ${signInAgain.error?.message || "unknown"}`
      );
    }
    report.signInAgain = true;

    const persisted = await loadAuthenticatedContext(
      anon,
      created.userId,
      organisation.id
    );
    const rolePersisted =
      persisted.currentOrganisationId === organisation.id &&
      persisted.membership?.organisation_id === organisation.id &&
      persisted.membership?.status === "active" &&
      persisted.membership?.role === "practitioner" &&
      persisted.membership?.professional_role === "manager";
    if (!rolePersisted) {
      throw new Error("role persistence assertion failed");
    }
    report.rolePersisted = true;
    report.currentOrganisation = persisted.currentOrganisationId;
    report.outcome = "PASS";
  } catch (error) {
    report.outcome = "FAIL";
    report.error = safeError(error);
    if (report.invitationAccepted !== true) report.invitationAccepted = false;
    if (report.signInAgain !== true) report.signInAgain = false;
    if (report.rolePersisted !== true) report.rolePersisted = false;
    process.exitCode = 1;
  } finally {
    invitationToken = null;
    if (anon) {
      await anon.auth.signOut().catch(() => undefined);
    }

    const createdAnything = Boolean(
      created.userId ||
        created.invitationId ||
        created.rehearsalMembershipId ||
        created.profileId ||
        created.personalOrganisationIds.length ||
        created.auditLogIds.length
    );

    if (createdAnything && admin && rehearsalOrgId) {
      const failures = await cleanupCreated(admin, created, rehearsalOrgId);
      if (failures.length) {
        report.cleanup = false;
        report.outcome = "CLEANUP_FAIL";
        report.error = safeError(failures.join("; "));
        console.error(JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return;
      }
      report.cleanup = true;
    } else if (createdAnything) {
      report.cleanup = false;
      report.outcome = "CLEANUP_FAIL";
      report.error = "CLEANUP_FAIL admin or rehearsal organisation unavailable";
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    } else {
      report.cleanup = true;
    }

    const printer = report.outcome === "PASS" ? console.log : console.error;
    printer(JSON.stringify(report, null, 2));
    if (report.outcome !== "PASS") {
      process.exitCode = 1;
    }
  }
}

main();
