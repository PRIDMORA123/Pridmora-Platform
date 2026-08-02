/**
 * Authenticated end-to-end Coaching Moment smoke test against the linked Supabase project.
 * Creates a temporary coach + relationship, runs create → continue without guidance →
 * capture → complete, asserts no formal session row was created, then cleans up.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = resolve(root, ".env.local");
  const text = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error("Missing Supabase env.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `cm-e2e-${Date.now()}@identity.test`;
const password = `CmE2e!${Date.now()}x`;

let userId = null;
let clientId = null;
let momentId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const { data: created, error: createUserError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  assert(!createUserError && created.user, `createUser failed: ${createUserError?.message}`);
  userId = created.user.id;

  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      coach_id: userId,
      name: "E2E Coaching Moment Client",
      organisation: "Identity E2E",
      role: "Manager",
      status: "Active",
      current_focus: "Accountability conversations",
    })
    .select("id")
    .single();
  assert(!clientError && client, `create client failed: ${clientError?.message}`);
  clientId = client.id;

  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  assert(!signInError, `signIn failed: ${signInError?.message}`);

  const now = new Date().toISOString();
  const { data: draft, error: draftError } = await userClient
    .from("coaching_moments")
    .insert({
      client_id: clientId,
      coach_id: userId,
      created_by: userId,
      status: "draft",
      situation:
        "Sarah has missed another deadline and became defensive when I raised it.",
      desired_outcome: "Clear ownership and early risk communication.",
      generated_questions: [],
      insight_status: "not_requested",
      no_commitment_agreed: false,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  assert(!draftError && draft, `create draft failed: ${draftError?.message}`);
  momentId = draft.id;
  console.log("✓ create draft Coaching Moment");

  const { data: started, error: startError } = await userClient
    .from("coaching_moments")
    .update({
      status: "in_progress",
      occurred_at: now,
      updated_at: new Date().toISOString(),
    })
    .eq("id", momentId)
    .eq("coach_id", userId)
    .select("*")
    .single();
  assert(!startError && started?.status === "in_progress", `start failed: ${startError?.message}`);
  console.log("✓ continue without guidance (draft → in_progress)");

  const { data: captured, error: captureError } = await userClient
    .from("coaching_moments")
    .update({
      status: "captured",
      outcome_notes:
        "Sarah accepted that she had not raised the risk early enough.",
      agreed_commitment:
        "She will flag delivery risks at least 48 hours before future deadlines.",
      follow_up: "Review progress at the next one-to-one.",
      private_note: "PRIVATE — must never appear in evidence.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", momentId)
    .select("*")
    .single();
  assert(
    !captureError && captured?.status === "captured",
    `capture failed: ${captureError?.message}`
  );
  console.log("✓ save outcome with commitment");

  const { data: completed, error: completeError } = await userClient
    .from("coaching_moments")
    .update({
      status: "complete",
      updated_at: new Date().toISOString(),
    })
    .eq("id", momentId)
    .select("*")
    .single();
  assert(
    !completeError && completed?.status === "complete",
    `complete failed: ${completeError?.message}`
  );
  console.log("✓ complete Coaching Moment");

  const { count: sessionCount, error: sessionError } = await userClient
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);
  assert(!sessionError, `session count failed: ${sessionError?.message}`);
  assert(sessionCount === 0, `Expected 0 formal sessions, found ${sessionCount}`);
  console.log("✓ no formal session created");

  assert(
    completed.private_note?.includes("PRIVATE"),
    "private note should remain stored on the moment row"
  );
  assert(
    completed.interaction_type === undefined,
    "no interaction_type column required on sessions — moments are separate"
  );
  console.log("✓ private note retained on moment; formal session model untouched");

  // Cross-relationship isolation: another user must not see this moment
  const otherEmail = `cm-e2e-other-${Date.now()}@identity.test`;
  const { data: other, error: otherErr } = await admin.auth.admin.createUser({
    email: otherEmail,
    password,
    email_confirm: true,
  });
  assert(!otherErr && other.user, `other user create failed: ${otherErr?.message}`);
  const otherClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await otherClient.auth.signInWithPassword({ email: otherEmail, password });
  const { data: leaked } = await otherClient
    .from("coaching_moments")
    .select("id")
    .eq("id", momentId)
    .maybeSingle();
  assert(!leaked, "other coach must not see this Coaching Moment");
  console.log("✓ relationship isolation held");
  await admin.auth.admin.deleteUser(other.user.id);

  console.log("\nAuthenticated Coaching Moment E2E: PASS");
} catch (error) {
  console.error("\nAuthenticated Coaching Moment E2E: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (clientId) {
    await admin.from("coaching_moments").delete().eq("client_id", clientId);
    await admin.from("clients").delete().eq("id", clientId);
  }
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
}
