#!/usr/bin/env node
/**
 * Start Next against IDENTITY only (ordinary local development).
 * Loads .env.local, pins PRIDMORA_ENV=identity, binds 127.0.0.1:3000,
 * and refuses localhost Site URL or a non-IDENTITY Supabase ref.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const IDENTITY_REF = "lxfdhnwjmtfbawznivbu";
const CANONICAL_SITE = "http://127.0.0.1:3000";
const root = process.cwd();
const envPath = resolve(root, ".env.local");

if (!existsSync(envPath)) {
  console.error("Missing .env.local — cannot start IDENTITY safely.");
  process.exit(1);
}

const env = { ...process.env };
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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
  // File values win for IDENTITY boot so stray shell Pilot exports cannot stick.
  env[key] = value;
}

env.PRIDMORA_ENV = "identity";
env.PRIDMORA_EXPECTED_SUPABASE_REF = IDENTITY_REF;
env.NEXT_PUBLIC_SITE_URL = CANONICAL_SITE;
env.APP_URL = CANONICAL_SITE;

const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  console.error("IDENTITY NEXT_PUBLIC_SUPABASE_URL is invalid.");
  process.exit(1);
}

if (host !== `${IDENTITY_REF}.supabase.co`) {
  console.error(
    `Refusing to start: expected ${IDENTITY_REF}.supabase.co, got ${host || "(empty)"}.`
  );
  process.exit(1);
}

console.info(`Starting IDENTITY Next (project ${IDENTITY_REF}) site=${CANONICAL_SITE}`);

const args = process.argv.slice(2);
const child = spawn(
  "npx",
  ["next", "dev", "-H", "127.0.0.1", "-p", "3000", ...args],
  {
    cwd: root,
    env,
    stdio: "inherit",
  }
);

child.on("exit", code => process.exit(code ?? 1));
