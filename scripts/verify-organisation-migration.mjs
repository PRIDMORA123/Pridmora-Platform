#!/usr/bin/env node
/**
 * Migration verification for organisation foundation.
 * Run after applying supabase/migrations/20260802140000_organisation_foundation.sql
 *
 * Usage:
 *   node --experimental-strip-types scripts/verify-organisation-migration.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const requiredTables = [
  "organisations",
  "organisation_memberships",
  "organisation_invitations",
  "relationship_assignments",
  "organisation_audit_log",
  "organisation_migration_review",
];

const orgIdTables = [
  "clients",
  "sessions",
  "client_items",
  "coaching_reports",
];

async function tableExists(name) {
  const { error } = await sb.from(name).select("*").limit(1);
  if (!error) return true;
  return !/does not exist|schema cache|could not find/i.test(error.message)
    ? true
    : false;
}

async function countNullOrganisation(table) {
  const { count, error } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .is("organisation_id", null);
  if (error) return { error: error.message, count: null };
  return { error: null, count: count ?? 0 };
}

async function main() {
  console.log("Organisation migration verification\n");

  let failed = false;

  for (const table of requiredTables) {
    const ok = await tableExists(table);
    console.log(`table ${table}: ${ok ? "OK" : "MISSING"}`);
    if (!ok) failed = true;
  }

  for (const table of orgIdTables) {
    const result = await countNullOrganisation(table);
    if (result.error) {
      console.log(`null organisation_id on ${table}: ERROR ${result.error}`);
      // Column may not exist yet
      failed = true;
    } else {
      console.log(`null organisation_id on ${table}: ${result.count}`);
      if (result.count > 0) {
        console.log(`  → review organisation_migration_review for ${table}`);
      }
    }
  }

  const { count: personalOrgs } = await sb
    .from("organisations")
    .select("id", { count: "exact", head: true })
    .eq("organisation_type", "personal")
    .eq("status", "active");

  const { count: owners } = await sb
    .from("organisation_memberships")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("status", "active");

  const { count: primaryAssignments } = await sb
    .from("relationship_assignments")
    .select("id", { count: "exact", head: true })
    .eq("assignment_role", "primary")
    .eq("status", "active");

  const { count: reviewRows } = await sb
    .from("organisation_migration_review")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);

  console.log(`\npersonal organisations: ${personalOrgs ?? 0}`);
  console.log(`owner memberships: ${owners ?? 0}`);
  console.log(`active primary assignments: ${primaryAssignments ?? 0}`);
  console.log(`unresolved migration review rows: ${reviewRows ?? 0}`);

  // Idempotency probe: ensure_personal_organisation twice for a profile user
  const { data: profile } = await sb.from("profiles").select("id").limit(1).maybeSingle();
  if (profile?.id) {
    const first = await sb.rpc("ensure_personal_organisation", {
      p_user_id: profile.id,
    });
    const second = await sb.rpc("ensure_personal_organisation", {
      p_user_id: profile.id,
    });
    if (first.data && second.data && first.data === second.data) {
      console.log("idempotent personal org: OK");
    } else {
      console.log("idempotent personal org: FAIL", first.error || second.error || first.data);
      failed = true;
    }
  }

  if (failed) {
    console.error("\nVerification FAILED");
    process.exit(1);
  }

  console.log("\nVerification PASSED (review queue may still contain ambiguous rows)");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
