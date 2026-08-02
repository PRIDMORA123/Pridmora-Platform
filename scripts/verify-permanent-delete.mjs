/**
 * Verifies the ownership-scoped cascade delete used by permanentlyDeleteClientInDb.
 * Loads credentials from .env.local (never prints secrets).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !service || !anon) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function deleteOwnedClientDependents(coachId, clientId) {
  for (const table of ["coaching_reports", "sessions", "client_items"]) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq("client_id", clientId)
      .eq("coach_id", coachId);
    if (
      error &&
      !/could not find the table|schema cache|does not exist|relation/i.test(error.message)
    ) {
      throw new Error(`${table}: ${error.message}`);
    }
  }
}

async function permanentlyDelete(coachId, clientId) {
  const owned = await admin
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("coach_id", coachId)
    .maybeSingle();
  if (owned.error) throw new Error(owned.error.message);
  if (!owned.data) return false;
  await deleteOwnedClientDependents(coachId, clientId);
  const { data, error } = await admin
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("coach_id", coachId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function main() {
  const coachId = "01aa1f21-574d-4f17-97d9-1d2ad79f8188";

  // Reproduce pre-fix RPC visibility for authenticated-style call (anon key, no user JWT).
  const rpcRes = await fetch(`${url}/rest/v1/rpc/permanently_delete_client`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_client_id: "00000000-0000-0000-0000-000000000000" }),
  });
  const rpcBody = await rpcRes.text();
  console.log("PRECHECK RPC status", rpcRes.status, rpcBody.slice(0, 300));

  const scenarios = [
    { name: "DEL-TEST no sessions", withSessions: false, withItems: false },
    { name: "DEL-TEST with sessions", withSessions: true, withItems: false },
    { name: "DEL-TEST with items", withSessions: false, withItems: true },
    { name: "DEL-TEST with report attempt", withSessions: true, withItems: true, withReport: true },
  ];

  const created = [];
  for (const s of scenarios) {
    const id = crypto.randomUUID();
    const { error: cErr } = await admin.from("clients").insert({
      id,
      coach_id: coachId,
      name: s.name,
      status: "Active",
      initials: "DT",
    });
    if (cErr) throw new Error(`client insert: ${cErr.message}`);

    if (s.withSessions) {
      const { error } = await admin.from("sessions").insert({
        id: crypto.randomUUID(),
        client_id: id,
        coach_id: coachId,
        session_number: 1,
        notes: "test session",
        preparation: "prep notes",
      });
      if (error) throw new Error(`session insert: ${error.message}`);
    }

    if (s.withItems) {
      const { error } = await admin.from("client_items").insert({
        id: crypto.randomUUID(),
        client_id: id,
        coach_id: coachId,
        item_type: "strength",
        title: "Test strength",
      });
      if (error) throw new Error(`item insert: ${error.message}`);
    }

    if (s.withReport) {
      const { error } = await admin.from("coaching_reports").insert({
        id: crypto.randomUUID(),
        client_id: id,
        coach_id: coachId,
        report_type: "progress",
        selected_session_ids: [],
        approved_content: { text: "report" },
        approval_status: "approved",
      });
      console.log(
        "coaching_reports insert:",
        error ? `SKIPPED (${error.message})` : "ok"
      );
    }

    created.push({ id, name: s.name });
  }

  for (const c of created) {
    const ok = await permanentlyDelete(coachId, c.id);
    const check = await admin.from("clients").select("id").eq("id", c.id).maybeSingle();
    const sess = await admin.from("sessions").select("id").eq("client_id", c.id);
    const items = await admin.from("client_items").select("id").eq("client_id", c.id);
    console.log("SCENARIO", {
      name: c.name,
      deleted: ok,
      clientGone: !check.data,
      sessionsLeft: sess.error ? sess.error.message : sess.data?.length,
      itemsLeft: items.error ? items.error.message : items.data?.length,
    });
  }

  // Clean the client the UI repeatedly failed to delete.
  const stuckId = "81038428-033a-43cd-8325-d4cb0512d09b";
  const stuck = await admin
    .from("clients")
    .select("id,name,coach_id")
    .eq("id", stuckId)
    .maybeSingle();
  console.log("STUCK BEFORE", stuck.data ?? null);
  if (stuck.data?.coach_id === coachId) {
    const sessBefore = await admin.from("sessions").select("id").eq("client_id", stuckId);
    const itemsBefore = await admin.from("client_items").select("id").eq("client_id", stuckId);
    console.log("STUCK DEPS", {
      sessions: sessBefore.data?.length ?? sessBefore.error?.message,
      items: itemsBefore.data?.length ?? itemsBefore.error?.message,
    });
    const ok = await permanentlyDelete(coachId, stuckId);
    const after = await admin.from("clients").select("id").eq("id", stuckId).maybeSingle();
    console.log("STUCK AFTER", { deleted: ok, clientGone: !after.data });
  }

  // Foreign-key / OpenAPI visibility summary (no secrets).
  const openapiRes = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  const openapi = await openapiRes.json();
  const tables = Object.keys(openapi.definitions || {}).filter((t) =>
    /client|session|report|profile/i.test(t)
  );
  const rpcs = Object.keys(openapi.paths || {}).filter((p) =>
    /permanently_delete|archive_client|restore_client/i.test(p)
  );
  console.log("OPENAPI TABLES", tables);
  console.log("OPENAPI RPCS", rpcs);
}

main().catch((error) => {
  console.error("VERIFY FAILED:", error.message);
  process.exit(1);
});
