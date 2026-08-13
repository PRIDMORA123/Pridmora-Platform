#!/usr/bin/env node
/**
 * Start Next against Pridmora Pilot only.
 * Loads .env.pilot.local into the process env (overriding .env.local values),
 * pins PRIDMORA_ENV=pilot, and fails before boot if the project ref or
 * canonical origin is wrong.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PILOT_REF = "jfcxnkmflfzzxqovkuqw";
const CANONICAL_SITE = "http://127.0.0.1:3001";
const root = process.cwd();
const pilotEnvPath = resolve(root, ".env.pilot.local");

if (!existsSync(pilotEnvPath)) {
  console.error("Missing .env.pilot.local — cannot start Pilot safely.");
  process.exit(1);
}

const env = { ...process.env };
for (const line of readFileSync(pilotEnvPath, "utf8").split(/\r?\n/)) {
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
  // Pilot file always wins over shell / .env.local leakage.
  env[key] = value;
}

env.PRIDMORA_ENV = "pilot";
env.PRIDMORA_EXPECTED_SUPABASE_REF = PILOT_REF;
env.NEXT_PUBLIC_SITE_URL = CANONICAL_SITE;
env.APP_URL = CANONICAL_SITE;

const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  console.error("Pilot NEXT_PUBLIC_SUPABASE_URL is invalid.");
  process.exit(1);
}

if (host !== `${PILOT_REF}.supabase.co`) {
  console.error(
    `Refusing to start: expected ${PILOT_REF}.supabase.co, got ${host || "(empty)"}.`
  );
  process.exit(1);
}

console.info(`Starting Pilot Next (project ${PILOT_REF}) site=${CANONICAL_SITE}`);

const args = process.argv.slice(2);
const child = spawn(
  "npx",
  ["next", "dev", "-H", "127.0.0.1", "-p", "3001", ...args],
  {
    cwd: root,
    env,
    stdio: "inherit",
  }
);

child.on("exit", code => process.exit(code ?? 1));
