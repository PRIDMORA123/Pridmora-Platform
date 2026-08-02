/**
 * Compares live Supabase PostgREST OpenAPI columns against the session workflow fields.
 *
 * Usage:
 *   node scripts/verify-session-workflow-schema.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment
 * (or .env.local when run via: set -a && source .env.local && set +a && node ...).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const REQUIRED_SESSION_COLUMNS = [
  "status",
  "title",
  "duration_minutes",
  "location",
  "completed_at",
  "notes_saved_at",
  "summary_status",
  "commitments",
  "parking_lot",
  "outcomes",
  "prep_purpose",
  "prep_topics",
  "prep_questions",
  "prep_commitments_review",
  "prep_risks",
  "prep_private_notes",
  "reflect_what_shifted",
  "reflect_what_surprised",
  "reflect_what_worked",
  "reflect_differently",
  "reflect_professional_learning",
  "reflect_private",
  "session_date",
  "starts_at",
  "notes",
  "preparation",
  "ai_draft_summary",
  "agreed_actions",
];

const REQUIRED_ACTION_COLUMNS = ["session_id", "owner", "item_type", "status", "event_date", "detail"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/`, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/openapi+json",
  },
});

if (!res.ok) {
  console.error(`OpenAPI fetch failed: HTTP ${res.status}`);
  process.exit(1);
}

const spec = await res.json();
const sessions = Object.keys(spec.definitions?.sessions?.properties || {}).sort();
const clientItems = Object.keys(spec.definitions?.client_items?.properties || {}).sort();
const missingSessions = REQUIRED_SESSION_COLUMNS.filter(column => !sessions.includes(column));
const missingActions = REQUIRED_ACTION_COLUMNS.filter(column => !clientItems.includes(column));

console.log(
  JSON.stringify(
    {
      ok: missingSessions.length === 0 && missingActions.length === 0,
      missingSessions,
      missingActions,
      apply:
        "supabase/migrations/20260725120000_session_workflow_foundation.sql",
    },
    null,
    2
  )
);

process.exit(missingSessions.length === 0 && missingActions.length === 0 ? 0 : 2);
