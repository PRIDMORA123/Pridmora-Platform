/**
 * Quarantine AI/generated Journey fields on a session that contain another
 * person's content. Does not delete the session row.
 *
 * Usage:
 *   node scripts/quarantine-misattributed-session.mjs \
 *     --session-id=c87df410-d532-48f9-b4e2-125d097b147c \
 *     --expected-name="Michael Smith"
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
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

function arg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(item => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

loadEnvLocal();

const sessionId = arg("session-id") || "c87df410-d532-48f9-b4e2-125d097b147c";
const expectedName = arg("expected-name") || "Michael Smith";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const GENERATED_FIELDS = [
  "summary",
  "ai_draft_summary",
  "professional_identity_development",
  "strengths_observed",
  "values_becoming_visible",
  "emerging_themes",
  "agreed_actions",
  "commitments",
  "coach_reflection",
  "suggested_focus",
  "outcomes",
  "notes",
];

async function main() {
  const { data: session, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!session) {
    console.error("Session not found", sessionId);
    process.exit(1);
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, coach_id")
    .eq("id", session.client_id)
    .maybeSingle();

  console.log({
    sessionId,
    relationship_id: session.client_id,
    person_name: client?.name,
    expectedName,
    session_number: session.session_number,
  });

  if (client?.name && client.name !== expectedName) {
    console.error(
      `Refusing quarantine: relationship person is "${client.name}", expected "${expectedName}".`
    );
    process.exit(1);
  }

  const snapshot = {
    quarantined_at: new Date().toISOString(),
    reason:
      "Misattributed Journey/AI content naming another coachee (Sarah) on Michael's relationship.",
    session_id: session.id,
    relationship_id: session.client_id,
    coach_id: session.coach_id,
    fields: Object.fromEntries(
      GENERATED_FIELDS.map(field => [field, session[field] ?? null])
    ),
    summary_status: session.summary_status,
    ai_summary_approved: session.ai_summary_approved,
  };

  const dir = join(process.cwd(), ".quarantine");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `session-${sessionId}.json`);
  writeFileSync(file, JSON.stringify(snapshot, null, 2));
  console.log("Wrote quarantine snapshot", file);

  const cleared = Object.fromEntries(GENERATED_FIELDS.map(field => [field, ""]));
  const { data: updated, error: updateError } = await supabase
    .from("sessions")
    .update({
      ...cleared,
      summary_status: "not_generated",
      ai_summary_approved: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("client_id", session.client_id)
    .eq("coach_id", session.coach_id)
    .select("id, client_id, summary, summary_status, ai_summary_approved")
    .single();

  if (updateError) throw updateError;

  // Best-effort audit row (ignore if table missing).
  try {
    await supabase.from("intelligence_audit_log").insert({
      user_id: session.coach_id,
      entity_type: "session",
      entity_id: sessionId,
      action: "quarantine_misattributed_journey_content",
      previous_value: snapshot,
      new_value: {
        summary_status: "not_generated",
        ai_summary_approved: false,
        cleared_fields: GENERATED_FIELDS,
      },
    });
  } catch {
    // ignore
  }

  console.log("Quarantined session fields:", updated);

  // Verify no Sarah text remains on Michael relationship sessions.
  const { data: michaelSessions } = await supabase
    .from("sessions")
    .select(
      "id, session_number, summary, ai_draft_summary, notes, professional_identity_development"
    )
    .eq("client_id", session.client_id);

  const remaining = (michaelSessions ?? []).flatMap(row => {
    const bad = [];
    for (const [column, value] of Object.entries(row)) {
      if (typeof value === "string" && /\bsarah\b/i.test(value)) {
        bad.push({ id: row.id, column, excerpt: value.slice(0, 120) });
      }
    }
    return bad;
  });

  console.log("Remaining Sarah mentions on Michael sessions:", remaining);
  if (remaining.length > 0) process.exit(2);
  console.log("OK — Michael sessions no longer contain Sarah text.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
