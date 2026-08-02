/**
 * Live QA for preparation relationship isolation.
 * Confirms account clients and re-runs the isolation test matrix.
 * Never logs confidential preparation content.
 */
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: clients, error } = await sb
  .from("clients")
  .select("id,name,organisation,coach_id")
  .order("name");

if (error) {
  console.error("client_query_failed", error.message);
  process.exit(1);
}

const names = (clients ?? []).map(row => String(row.name ?? ""));
const hasDanielRoberts = names.includes("Daniel Roberts");
const hasDanielReed = names.includes("Daniel Reed");
const hasSarahThompson = names.includes("Sarah Thompson");

console.log(
  JSON.stringify(
    {
      clientCount: names.length,
      hasDanielRoberts,
      hasDanielReed,
      hasSarahThompson,
    },
    null,
    2
  )
);

if (!hasDanielRoberts) {
  console.error("Daniel Roberts not found");
  process.exit(1);
}

// Incident reproduction (substring vs whole-token).
const incidentText =
  "Daniel Roberts agreed to create greater ownership with managers.";
const normalised = incidentText
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[\u2019\u2018\u0060\u00B4\u02BC']/g, "'")
  .replace(/'s\b/g, "")
  .replace(/[^\p{L}\p{N}\s-]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();
const tokens = normalised.split(" ").filter(Boolean);
const wholeTokenReed = tokens.includes("reed");
const substringReed = incidentText.toLowerCase().includes("reed");

console.log(
  JSON.stringify(
    {
      incident: {
        substringReed,
        wholeTokenReed,
        falsePositiveFixed: substringReed && !wholeTokenReed,
      },
    },
    null,
    2
  )
);

if (wholeTokenReed) {
  console.error("incident_still_matches_reed_as_whole_token");
  process.exit(1);
}

const test = spawnSync(
  "npx",
  ["vitest", "run", "tests/preparation-relationship-isolation.test.ts"],
  { stdio: "inherit", cwd: process.cwd(), env: process.env }
);

if (test.status !== 0) {
  process.exit(test.status ?? 1);
}

console.log("preparation_isolation_qa_ok");
