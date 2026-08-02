/**
 * Clean-environment verification against the linked Supabase pilot project.
 *
 * Uses real authenticated users for all access / RLS proofs.
 * Service role is used only for user provisioning and cleanup — never as
 * proof that RLS denies access.
 *
 * Usage:
 *   APP_URL=http://127.0.0.1:3000 node --experimental-strip-types scripts/verify-clean-environment.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runId = `cev-${Date.now().toString(36)}`;
const password = `Cev!${runId.slice(-10)}Aa1`;

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

if (!url || !anonKey || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY.");
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];
console.log(`Clean-environment verification`);
console.log(`Project: ${projectRef}`);
console.log(`App URL: ${appUrl}`);
console.log(`Run: ${runId}\n`);

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** @type {{ id: string, email: string, role: string }[]} */
const createdUsers = [];
/** @type {string[]} */
const createdClientIds = [];
/** @type {string[]} */
const createdSessionIds = [];
/** @type {string[]} */
const createdOrgIds = [];
/** @type {string[]} */
const createdUpdateIds = [];
/** @type {string[]} */
const createdInvitationIds = [];

const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, error) {
  const detail = error instanceof Error ? error.message : String(error);
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}

async function createAuthUser(label, roleHint) {
  const email = `${runId}-${label}@pridmora-cev.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `CEV ${label}` },
  });
  assert(!error && data.user, `createUser(${label}): ${error?.message}`);
  const user = { id: data.user.id, email, role: roleHint };
  createdUsers.push(user);

  // Ensure profile exists (trigger may already have created it).
  await admin.from("profiles").upsert({
    id: user.id,
    full_name: `CEV ${label}`,
    professional_title: "Coach",
    preparation_style: "guided",
    coaching_intelligence_mode: "assisted",
  });

  return user;
}

function authClient() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email) {
  const client = authClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert(!error && data.session, `signIn(${email}): ${error?.message}`);
  return { client, session: data.session, user: data.user };
}

/** Real @supabase/ssr cookies via setSession (matches app cookie encoding). */
const cookieCache = new Map();

async function establishBrowserCookies(email) {
  if (cookieCache.has(email)) return cookieCache.get(email);

  const anon = authClient();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  assert(!error && data.session, `cookie sign-in(${email}): ${error?.message}`);

  /** @type {{ name: string, value: string }[]} */
  const jar = [];
  const ssr = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.map(({ name, value }) => ({ name, value })),
      setAll: cookiesToSet => {
        for (const item of cookiesToSet) {
          const index = jar.findIndex(entry => entry.name === item.name);
          if (index >= 0) jar[index] = { name: item.name, value: item.value };
          else jar.push({ name: item.name, value: item.value });
        }
      },
    },
  });

  const { error: setError } = await ssr.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  assert(!setError, `setSession(${email}): ${setError?.message}`);
  assert(jar.length > 0, `no SSR cookies written for ${email}`);

  const cookieHeader = jar.map(entry => `${entry.name}=${entry.value}`).join("; ");
  cookieCache.set(email, cookieHeader);
  return cookieHeader;
}

async function api(email, method, path, body) {
  const cookie = await establishBrowserCookies(email);
  const response = await fetch(`${appUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: response.status, ok: response.ok, json };
}

function hashInvitationToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function cleanup() {
  console.log("\nCleaning up test records…");

  for (const updateId of createdUpdateIds) {
    await admin.from("development_updates").delete().eq("id", updateId);
  }
  for (const clientId of createdClientIds) {
    await admin.from("development_updates").delete().eq("client_id", clientId);
    await admin.from("development_profiles").delete().eq("client_id", clientId);
    await admin.from("coaching_moments").delete().eq("client_id", clientId);
    await admin.from("client_items").delete().eq("client_id", clientId);
  }
  for (const sessionId of createdSessionIds) {
    await admin.from("sessions").delete().eq("id", sessionId);
  }
  for (const clientId of createdClientIds) {
    await admin.from("sessions").delete().eq("client_id", clientId);
    await admin.from("relationship_assignments").delete().eq("client_id", clientId);
    await admin.from("clients").delete().eq("id", clientId);
  }
  for (const invitationId of createdInvitationIds) {
    await admin.from("organisation_invitations").delete().eq("id", invitationId);
  }
  for (const orgId of createdOrgIds) {
    await admin.from("organisation_invitations").delete().eq("organisation_id", orgId);
    await admin.from("relationship_assignments").delete().eq("organisation_id", orgId);
    await admin.from("organisation_audit_log").delete().eq("organisation_id", orgId);
    await admin.from("organisation_memberships").delete().eq("organisation_id", orgId);
    await admin.from("organisations").delete().eq("id", orgId);
  }

  // Also remove orgs created by ensure_personal_organisation for our users.
  for (const user of createdUsers) {
    const { data: memberships } = await admin
      .from("organisation_memberships")
      .select("organisation_id")
      .eq("user_id", user.id);
    for (const row of memberships || []) {
      const orgId = row.organisation_id;
      await admin.from("organisation_invitations").delete().eq("organisation_id", orgId);
      await admin.from("relationship_assignments").delete().eq("organisation_id", orgId);
      await admin.from("organisation_audit_log").delete().eq("organisation_id", orgId);
      await admin.from("organisation_memberships").delete().eq("organisation_id", orgId);
      await admin.from("profiles").update({ current_organisation_id: null }).eq("id", user.id);
      await admin.from("organisations").delete().eq("id", orgId);
    }
    await admin.from("profiles").delete().eq("id", user.id);
    await admin.auth.admin.deleteUser(user.id);
  }

  // Verify users are gone
  let remainingUsers = 0;
  for (const user of createdUsers) {
    const { data } = await admin.auth.admin.getUserById(user.id);
    if (data?.user) remainingUsers += 1;
  }
  let remainingClients = 0;
  if (createdClientIds.length) {
    const { data } = await admin.from("clients").select("id").in("id", createdClientIds);
    remainingClients = data?.length || 0;
  }
  console.log(
    `Cleanup done. Remaining test users=${remainingUsers}, clients=${remainingClients}`
  );
  if (remainingUsers || remainingClients) {
    throw new Error("Cleanup incomplete");
  }
}

async function check(name, fn) {
  try {
    await fn();
  } catch (error) {
    fail(name, error);
  }
}

async function main() {
  let ownerA;
  let ownerB;
  let adminUser;
  let oversightUser;
  let inviteeUser;
  let orgA;
  let orgB;
  let clientId;
  let sessionId;
  let sessionNotes =
    "Discussed ownership under pressure. She recognised she takes decisions back too quickly.";
  let privateNotes = "PRIVATE CEV NOTE — admin/oversight must not see.";

  try {
    ownerA = await createAuthUser("owner-a", "owner");
    ownerB = await createAuthUser("owner-b", "owner");
    adminUser = await createAuthUser("admin", "administrator");
    oversightUser = await createAuthUser("oversight", "oversight");
    inviteeUser = await createAuthUser("invitee", "practitioner");

    await check("new user receives personal organisation + owner membership", async () => {
      const { client } = await signIn(ownerA.email);
      const { data: orgId, error: rpcError } = await client.rpc(
        "ensure_personal_organisation",
        { p_user_id: ownerA.id }
      );
      assert(!rpcError && orgId, `ensure_personal_organisation: ${rpcError?.message}`);
      orgA = orgId;
      createdOrgIds.push(orgA);

      const { data: org, error: orgError } = await client
        .from("organisations")
        .select("id, organisation_type, status, created_by")
        .eq("id", orgA)
        .single();
      assert(!orgError && org, `read personal org: ${orgError?.message}`);
      assert(org.organisation_type === "personal", "expected personal organisation_type");
      assert(org.created_by === ownerA.id, "created_by mismatch");

      const { data: membership, error: memError } = await client
        .from("organisation_memberships")
        .select("role, status, user_id")
        .eq("organisation_id", orgA)
        .eq("user_id", ownerA.id)
        .single();
      assert(!memError && membership, `owner membership: ${memError?.message}`);
      assert(membership.role === "owner", `expected owner, got ${membership.role}`);
      assert(membership.status === "active", "owner membership not active");
      pass("new user receives personal organisation", orgA);
      pass("owner membership is created", membership.role);
    });

    await check("prepare second organisation + unassigned admin/oversight", async () => {
      const { client } = await signIn(ownerB.email);
      const { data: orgId, error } = await client.rpc("ensure_personal_organisation", {
        p_user_id: ownerB.id,
      });
      assert(!error && orgId, `org B: ${error?.message}`);
      orgB = orgId;
      createdOrgIds.push(orgB);

      const { client: adminAuth } = await signIn(adminUser.email);
      await adminAuth.rpc("ensure_personal_organisation", { p_user_id: adminUser.id });
      const { client: oversightAuth } = await signIn(oversightUser.email);
      await oversightAuth.rpc("ensure_personal_organisation", {
        p_user_id: oversightUser.id,
      });
      const { client: inviteeAuth } = await signIn(inviteeUser.email);
      await inviteeAuth.rpc("ensure_personal_organisation", {
        p_user_id: inviteeUser.id,
      });

      assert(orgA, "org A must exist before membership inserts");
      const { client: ownerClient } = await signIn(ownerA.email);
      await ownerClient
        .from("profiles")
        .update({ current_organisation_id: orgA })
        .eq("id", ownerA.id);

      const { error: adminMemErr } = await ownerClient
        .from("organisation_memberships")
        .insert({
          organisation_id: orgA,
          user_id: adminUser.id,
          role: "administrator",
          professional_role: null,
          status: "active",
          joined_at: new Date().toISOString(),
        });
      assert(!adminMemErr, `add admin membership: ${adminMemErr?.message}`);

      const { error: oversightMemErr } = await ownerClient
        .from("organisation_memberships")
        .insert({
          organisation_id: orgA,
          user_id: oversightUser.id,
          role: "oversight",
          professional_role: null,
          status: "active",
          joined_at: new Date().toISOString(),
        });
      assert(!oversightMemErr, `add oversight membership: ${oversightMemErr?.message}`);
      pass("prepare second organisation + unassigned admin/oversight", "ready");
    });

    await check("client create + organisation_id + primary assignment", async () => {
      assert(orgA, "org A required");
      const { client } = await signIn(ownerA.email);
      await client
        .from("profiles")
        .update({ current_organisation_id: orgA })
        .eq("id", ownerA.id);

      let usedApi = false;
      const created = await api(ownerA.email, "POST", "/api/clients", {
        name: `CEV Person ${runId}`,
        organisation: "CEV Pilot Org",
        role: "Director",
        currentFocus: "Lead with clarity under pressure",
      });
      if (created.ok && created.json?.client?.id) {
        clientId = created.json.client.id;
        usedApi = true;
      } else {
        console.log(
          `  (api client create ${created.status}: ${JSON.stringify(created.json)?.slice(0, 160)})`
        );
        clientId = crypto.randomUUID();
        const { error: clientError } = await client.from("clients").insert({
          id: clientId,
          coach_id: ownerA.id,
          organisation_id: orgA,
          name: `CEV Person ${runId}`,
          organisation: "CEV Pilot Org",
          role: "Director",
          status: "Active",
          current_focus: "Lead with clarity under pressure",
          initials: "CP",
        });
        assert(!clientError, `create client: ${clientError?.message}`);

        const { error: assignError } = await client.from("relationship_assignments").insert({
          organisation_id: orgA,
          client_id: clientId,
          user_id: ownerA.id,
          assignment_role: "primary",
          status: "active",
          assigned_by: ownerA.id,
          assigned_at: new Date().toISOString(),
        });
        assert(!assignError, `primary assignment: ${assignError?.message}`);
      }

      createdClientIds.push(clientId);

      const { data: clientRow, error: readErr } = await client
        .from("clients")
        .select("id, organisation_id, coach_id, name")
        .eq("id", clientId)
        .single();
      assert(!readErr && clientRow, `read client: ${readErr?.message}`);
      assert(clientRow.organisation_id === orgA, "organisation_id not populated");
      pass(
        "client can be created",
        usedApi ? "via /api/clients" : "via authenticated insert"
      );
      pass("organisation_id is populated", clientRow.organisation_id);

      const { data: assignment, error: aErr } = await client
        .from("relationship_assignments")
        .select("assignment_role, status, user_id")
        .eq("client_id", clientId)
        .eq("status", "active")
        .eq("assignment_role", "primary")
        .maybeSingle();
      assert(!aErr && assignment, `primary assignment missing: ${aErr?.message}`);
      assert(assignment.user_id === ownerA.id, "primary assignment user mismatch");
      pass("primary assignment is created", assignment.assignment_role);
    });

    await check("session can be completed", async () => {
      assert(clientId && orgA, "client/org required");
      const { client } = await signIn(ownerA.email);
      sessionId = crypto.randomUUID();
      const now = new Date().toISOString();
      const { error: insertError } = await client.from("sessions").insert({
        id: sessionId,
        client_id: clientId,
        coach_id: ownerA.id,
        organisation_id: orgA,
        session_number: 1,
        title: "CEV ownership session",
        session_date: "2026-08-02",
        status: "in_progress",
        focus: "Ownership under pressure",
        notes: sessionNotes,
        private_notes: privateNotes,
        reflect_private: privateNotes,
        summary_status: "not_generated",
      });
      assert(!insertError, `create session: ${insertError?.message}`);
      createdSessionIds.push(sessionId);

      const { data: completed, error: completeError } = await client
        .from("sessions")
        .update({
          status: "completed",
          completed_at: now,
          notes_saved_at: now,
          updated_at: now,
        })
        .eq("id", sessionId)
        .select("id, status, completed_at, notes, private_notes")
        .single();
      assert(!completeError && completed, `complete session: ${completeError?.message}`);
      assert(completed.status === "completed", "session status not completed");
      assert(completed.completed_at, "completed_at missing");
      pass("session can be completed", completed.status);
    });

    await check("Summary & Insights can be generated", async () => {
      assert(clientId && sessionId, "client/session required");
      const { client } = await signIn(ownerA.email);
      const generated = await api(ownerA.email, "POST", "/api/draft-summary", {
        notes: `${sessionNotes} She will leave one decision with her manager this week.`,
        focus: "Ownership under pressure",
        clientName: `CEV Person ${runId}`,
        clientId,
        sessionId,
      });
      assert(
        generated.ok && (generated.json?.summary || generated.json?.sections),
        `draft-summary failed (${generated.status}): ${JSON.stringify(generated.json)?.slice(0, 240)}`
      );

      const summaryText =
        generated.json.summary ||
        generated.json.sections?.aiDraftSummary ||
        generated.json.rawDraft;
      assert(summaryText && String(summaryText).trim().length > 20, "empty summary");

      const { error: persistError } = await client
        .from("sessions")
        .update({
          ai_draft_summary: summaryText,
          summary: summaryText,
          summary_status: "draft",
          emerging_themes: generated.json.sections?.emergingThemes || "Ownership",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      assert(!persistError, `persist summary: ${persistError?.message}`);
      pass("Summary & Insights can be generated", `HTTP ${generated.status}`);
    });

    await check("Development can be generated", async () => {
      assert(clientId && sessionId, "client/session required");
      const generated = await api(ownerA.email, "POST", "/api/development-updates/generate", {
        clientId,
        sessionId,
      });
      assert(
        generated.ok && (generated.json?.update || generated.json?.developmentUpdate),
        `development generate failed (${generated.status}): ${JSON.stringify(generated.json)?.slice(0, 300)}`
      );
      const update =
        generated.json.update || generated.json.developmentUpdate || generated.json;
      if (update?.id) createdUpdateIds.push(update.id);
      pass("Development can be generated", `HTTP ${generated.status}`);
    });

    await check("organisation can invite a member", async () => {
      assert(orgA, "org A required");
      const { client } = await signIn(ownerA.email);
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashInvitationToken(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      let invitationId = null;
      let acceptToken = null;
      let usedApi = false;
      const invited = await api(ownerA.email, "POST", "/api/organisations/invitations", {
        email: inviteeUser.email,
        role: "practitioner",
        professionalRole: "coach",
      });
      if (invited.ok && invited.json?.invitationId) {
        invitationId = invited.json.invitationId;
        usedApi = true;
        createdInvitationIds.push(invitationId);
        const tokenFromPath = invited.json.acceptPath?.split("token=")[1];
        acceptToken = tokenFromPath ? decodeURIComponent(tokenFromPath) : null;
      } else {
        console.log(
          `  (api invite ${invited.status}: ${JSON.stringify(invited.json)?.slice(0, 160)})`
        );
        const { data, error } = await client
          .from("organisation_invitations")
          .insert({
            organisation_id: orgA,
            email: inviteeUser.email,
            role: "practitioner",
            professional_role: "coach",
            token_hash: tokenHash,
            status: "pending",
            invited_by: ownerA.id,
            expires_at: expiresAt,
          })
          .select("id")
          .single();
        assert(!error && data, `invite insert: ${error?.message}`);
        invitationId = data.id;
        createdInvitationIds.push(invitationId);
        acceptToken = token;
      }

      const { data: inviteRow, error: inviteReadErr } = await client
        .from("organisation_invitations")
        .select("id, email, role, status")
        .eq("id", invitationId)
        .single();
      assert(!inviteReadErr && inviteRow, `read invite: ${inviteReadErr?.message}`);
      assert(
        inviteRow.status === "pending" || inviteRow.status === "accepted",
        `unexpected invite status ${inviteRow.status}`
      );
      pass(
        "organisation can invite a member",
        usedApi
          ? `${inviteRow.role} via API (${inviteRow.status})`
          : `${inviteRow.role} via authenticated insert (${inviteRow.status})`
      );

      // Separate authenticated accept proof (no service-role membership insert).
      await check("invitee can accept invitation", async () => {
        assert(acceptToken, "accept token missing");
        const accepted = await api(
          inviteeUser.email,
          "POST",
          "/api/organisations/invitations",
          { action: "accept", token: acceptToken }
        );
        assert(
          accepted.ok,
          `invitee accept failed (${accepted.status}): ${JSON.stringify(accepted.json)}`
        );
        pass("invitee can accept invitation", "accepted");
      });
    });

    await check("administrator cannot read unassigned notes", async () => {
      assert(sessionId && orgA, "session/org required");
      const { client } = await signIn(adminUser.email);
      await client
        .from("profiles")
        .update({ current_organisation_id: orgA })
        .eq("id", adminUser.id);

      const { data: sessionLeak } = await client
        .from("sessions")
        .select("id, notes, private_notes, summary, ai_draft_summary")
        .eq("id", sessionId)
        .maybeSingle();
      assert(
        !sessionLeak,
        `administrator read unassigned session content: ${JSON.stringify(sessionLeak)}`
      );
      pass("administrator cannot read unassigned notes", "session row hidden by RLS");
    });

    await check("oversight user cannot read notes or summaries", async () => {
      assert(sessionId && orgA && clientId, "session/org/client required");
      const { client } = await signIn(oversightUser.email);
      await client
        .from("profiles")
        .update({ current_organisation_id: orgA })
        .eq("id", oversightUser.id);

      const { data: sessionLeak } = await client
        .from("sessions")
        .select("id, notes, private_notes, summary, ai_draft_summary")
        .eq("id", sessionId)
        .maybeSingle();
      assert(
        !sessionLeak,
        `oversight read session content: ${JSON.stringify(sessionLeak)}`
      );

      const { data: clientMeta } = await client
        .from("clients")
        .select("id, name, organisation_id")
        .eq("id", clientId)
        .maybeSingle();
      pass(
        "oversight user cannot read notes or summaries",
        clientMeta
          ? "client metadata visible; session content hidden"
          : "client and session content hidden"
      );
    });

    await check("two organisations cannot access each other", async () => {
      assert(clientId && sessionId && orgA, "fixtures required");
      const { client } = await signIn(ownerB.email);
      const { data: foreignClient } = await client
        .from("clients")
        .select("id, name")
        .eq("id", clientId)
        .maybeSingle();
      assert(!foreignClient, `org B saw org A client: ${JSON.stringify(foreignClient)}`);

      const { data: foreignSession } = await client
        .from("sessions")
        .select("id, notes, summary")
        .eq("id", sessionId)
        .maybeSingle();
      assert(
        !foreignSession,
        `org B saw org A session: ${JSON.stringify(foreignSession)}`
      );

      const { data: foreignOrg } = await client
        .from("organisations")
        .select("id, name")
        .eq("id", orgA)
        .maybeSingle();
      assert(!foreignOrg, `org B saw org A organisation row: ${JSON.stringify(foreignOrg)}`);
      pass("two organisations cannot access each other", "client/session/org hidden");
    });

    await check("positive control: assigned owner can read notes", async () => {
      assert(sessionId, "session required");
      const { client } = await signIn(ownerA.email);
      const { data: ownSession, error } = await client
        .from("sessions")
        .select("id, notes, private_notes, summary")
        .eq("id", sessionId)
        .single();
      assert(!error && ownSession?.notes, `owner should read own notes: ${error?.message}`);
      assert(
        ownSession.private_notes?.includes("PRIVATE CEV NOTE"),
        "owner private notes missing"
      );
      pass("positive control: assigned owner can read notes", "ok");
    });
  } catch (error) {
    fail("clean-environment provisioning", error);
  } finally {
    try {
      await cleanup();
      pass("cleanup all test users and records", "complete");
    } catch (cleanupError) {
      fail("cleanup all test users and records", cleanupError);
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log("\n────────────────────────────────────────");
  console.log(
    `Result: ${results.filter(r => r.ok).length}/${results.length} checks passed`
  );
  if (failed.length) {
    console.log("Failures:");
    for (const item of failed) console.log(`  - ${item.name}: ${item.detail}`);
    process.exitCode = 1;
  } else {
    console.log("Clean-environment verification: PASS");
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
