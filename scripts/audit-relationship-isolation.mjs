/**
 * Data-integrity audit for relationship isolation.
 *
 * Flags suspect records for review — does NOT reassign them.
 *
 * Usage (with DATABASE_URL or SUPABASE_DB_URL):
 *   node scripts/audit-relationship-isolation.mjs
 */

import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL;

if (!connectionString) {
  console.error(
    "Set DATABASE_URL (or SUPABASE_DB_URL) before running the relationship isolation audit."
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  const findings = [];

  // Sessions whose client_id does not match the coach-owned client.
  const mismatchedSessions = await client.query(`
    select s.id as session_id, s.client_id, s.coach_id, c.name as client_name
    from public.sessions s
    left join public.clients c
      on c.id = s.client_id and c.coach_id = s.coach_id
    where c.id is null
    limit 200
  `);
  for (const row of mismatchedSessions.rows) {
    findings.push({
      kind: "session_orphaned_or_mismatched_client",
      ...row,
    });
  }

  // Development updates whose client_id does not match the session's client.
  const mismatchedUpdates = await client.query(`
    select u.id as update_id, u.client_id as update_client_id,
           s.client_id as session_client_id, u.session_id, u.coach_id
    from public.development_updates u
    join public.sessions s on s.id = u.session_id
    where u.client_id <> s.client_id
    limit 200
  `);
  for (const row of mismatchedUpdates.rows) {
    findings.push({
      kind: "development_update_session_client_mismatch",
      ...row,
    });
  }

  // Development profiles whose coach_id does not own the client.
  const mismatchedProfiles = await client.query(`
    select p.id as profile_id, p.client_id, p.coach_id
    from public.development_profiles p
    left join public.clients c
      on c.id = p.client_id and c.coach_id = p.coach_id
    where c.id is null
    limit 200
  `);
  for (const row of mismatchedProfiles.rows) {
    findings.push({
      kind: "development_profile_ownership_mismatch",
      ...row,
    });
  }

  // Reports whose client_id is not owned by the report coach.
  try {
    const mismatchedReports = await client.query(`
      select r.id as report_id, r.client_id, r.coach_id, r.title
      from public.development_reports r
      left join public.clients c
        on c.id = r.client_id and c.coach_id = r.coach_id
      where c.id is null
      limit 200
    `);
    for (const row of mismatchedReports.rows) {
      findings.push({
        kind: "development_report_ownership_mismatch",
        ...row,
      });
    }
  } catch {
    // Table may not exist yet.
  }

  // Summaries / identity fields that name a different person than the relationship owner.
  // Heuristic only — flag for human review, never auto-reassign.
  const nameSuspects = await client.query(`
    select s.id as session_id, s.client_id, c.name as person_name,
           left(coalesce(s.summary, ''), 200) as summary_excerpt
    from public.sessions s
    join public.clients c on c.id = s.client_id and c.coach_id = s.coach_id
    where coalesce(s.summary, '') <> ''
      and position(split_part(c.name, ' ', 1) in s.summary) = 0
      and exists (
        select 1 from public.clients other
        where other.coach_id = s.coach_id
          and other.id <> s.client_id
          and position(split_part(other.name, ' ', 1) in s.summary) > 0
      )
    limit 100
  `);
  for (const row of nameSuspects.rows) {
    findings.push({
      kind: "summary_names_other_relationship_person",
      note: "Flagged for review — do not auto-reassign.",
      ...row,
    });
  }

  if (findings.length === 0) {
    console.log(JSON.stringify({ ok: true, findings: [] }, null, 2));
  } else {
    console.log(
      JSON.stringify(
        {
          ok: false,
          count: findings.length,
          note: "Suspect records flagged for review. Do not automatically reassign.",
          findings,
        },
        null,
        2
      )
    );
  }

  await client.end();
  process.exit(findings.length > 0 ? 2 : 0);
}

main().catch(async error => {
  console.error("Audit failed:", error);
  try {
    await client.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
