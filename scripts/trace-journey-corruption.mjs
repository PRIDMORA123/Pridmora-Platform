/**
 * Trace Journey corruption: find Sarah phrases stored against the wrong relationship.
 *
 * Usage: node scripts/trace-journey-corruption.mjs
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PHRASE_FRAGMENTS = [
  "uncertainty following the announcement",
  "relying heavily",
  "sarah’s uncertainty",
  "sarah's uncertainty",
  "sarah recognised",
  "sarah recognized",
];

function textContainsTarget(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const lower = value.toLowerCase();
  if (/\bsarah\b/i.test(value)) return true;
  return PHRASE_FRAGMENTS.some(fragment => lower.includes(fragment));
}

function flatten(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v == null) out[k] = v;
    else if (typeof v === "object") out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}

function scanRow(table, row) {
  const flat = flatten(row);
  const hits = [];
  for (const [column, value] of Object.entries(flat)) {
    if (!textContainsTarget(value)) continue;
    hits.push({
      table,
      record_id: row.id,
      relationship_id: row.client_id ?? row.relationship_id ?? null,
      conversation_id: row.session_id ?? (table === "sessions" ? row.id : null),
      coach_id: row.coach_id ?? row.user_id ?? null,
      column,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
      excerpt: String(value).slice(0, 280),
    });
  }
  return hits;
}

async function main() {
  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, coach_id, current_focus, identity_summary, coach_insight");
  if (clientsError) throw clientsError;

  const nameById = Object.fromEntries(
    (clients ?? []).map(client => [client.id, client.name])
  );

  console.log("=== CLIENTS ===");
  for (const client of clients ?? []) {
    console.log({
      id: client.id,
      name: client.name,
      coach_id: client.coach_id,
    });
  }

  const hits = [];

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select(
      "id, client_id, coach_id, session_number, summary, ai_draft_summary, professional_identity_development, strengths_observed, values_becoming_visible, emerging_themes, agreed_actions, commitments, coach_reflection, notes, reflection, suggested_focus, prep_ai_brief, created_at, updated_at"
    )
    .limit(200);
  if (sessionsError) throw sessionsError;
  for (const row of sessions ?? []) hits.push(...scanRow("sessions", row));

  const { data: updates, error: updatesError } = await supabase
    .from("development_updates")
    .select("*")
    .limit(200);
  if (updatesError) throw updatesError;
  for (const row of updates ?? []) hits.push(...scanRow("development_updates", row));

  const { data: profiles, error: profilesError } = await supabase
    .from("development_profiles")
    .select("*")
    .limit(200);
  if (profilesError) throw profilesError;
  for (const row of profiles ?? []) hits.push(...scanRow("development_profiles", row));

  const { data: reports, error: reportsError } = await supabase
    .from("development_reports")
    .select("*")
    .limit(100);
  if (!reportsError) {
    for (const row of reports ?? []) hits.push(...scanRow("development_reports", row));
  }

  // Client-level identity / insight fields
  for (const client of clients ?? []) {
    hits.push(
      ...scanRow("clients", {
        id: client.id,
        client_id: client.id,
        coach_id: client.coach_id,
        identity_summary: client.identity_summary,
        coach_insight: client.coach_insight,
        current_focus: client.current_focus,
      })
    );
  }

  console.log("\n=== CORRUPTION HITS ===", hits.length);
  for (const hit of hits) {
    const ownerName = nameById[hit.relationship_id] || "UNKNOWN";
    const sarahOnNonSarah =
      /\bsarah\b/i.test(hit.excerpt) && !/sarah/i.test(ownerName);
    console.log({
      ...hit,
      person_name: ownerName,
      MISATTRIBUTED: sarahOnNonSarah,
    });
  }

  const misattributed = hits.filter(
    hit =>
      /\bsarah\b/i.test(hit.excerpt) &&
      !/sarah/i.test(nameById[hit.relationship_id] || "")
  );

  console.log("\n=== MISATTRIBUTED (Sarah text on non-Sarah relationship) ===");
  console.log(JSON.stringify(misattributed, null, 2));

  // Also dump Michael sessions summaries for manual inspection
  const michael = (clients ?? []).find(client =>
    /michael/i.test(client.name)
  );
  const sarah = (clients ?? []).find(client => /sarah/i.test(client.name));

  if (michael) {
    const michaelSessions = (sessions ?? []).filter(
      session => session.client_id === michael.id
    );
    console.log("\n=== MICHAEL SESSIONS (summary excerpts) ===");
    for (const session of michaelSessions) {
      console.log({
        id: session.id,
        session_number: session.session_number,
        summary: String(session.summary ?? "").slice(0, 400),
        ai_draft_summary: String(session.ai_draft_summary ?? "").slice(0, 200),
        professional_identity_development: String(
          session.professional_identity_development ?? ""
        ).slice(0, 200),
      });
    }
  }

  if (sarah) {
    console.log("\n=== SARAH RELATIONSHIP ID ===", sarah.id);
  }
  if (michael) {
    console.log("=== MICHAEL RELATIONSHIP ID ===", michael.id);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
