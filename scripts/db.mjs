#!/usr/bin/env node
/**
 * Repeatable database migration workflow for this project.
 *
 * Preferred path: Supabase CLI (`npx supabase db push`) after link.
 * Fallback path: DATABASE_URL + pg for a single SQL file (legacy scripts).
 *
 * Usage:
 *   npm run db:login
 *   npm run db:link
 *   npm run db:status
 *   npm run db:push
 *   npm run db:new -- describe_change
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal, projectRefFromEnv } from "./load-env-local.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const args = process.argv.slice(2);
const command = args[0] || "help";

loadEnvLocal(root);

function run(bin, binArgs, options = {}) {
  const result = spawnSync(bin, binArgs, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
    ...options,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

function supabaseArgs(extra) {
  return ["supabase", ...extra];
}

function printHelp() {
  console.log(`
Database migrations (repeatable)

Preferred workflow — Supabase CLI
  1. npm run db:login
  2. Add SUPABASE_DB_PASSWORD to .env.local (database password from dashboard)
  3. npm run db:link
  4. npm run db:status
  5. npm run db:push

Where to get credentials in the current Supabase dashboard
  • Project ref: already in NEXT_PUBLIC_SUPABASE_URL (subdomain before .supabase.co)
  • Database password / connection strings:
      Open your project → click Connect (top of the dashboard)
      → choose Session mode (pooler, port 5432) or Direct connection
      → copy the URI and replace [YOUR-PASSWORD]
    Alternative: Project Settings (gear) → Database → Connection string

Commands
  npm run db:login          Log in to Supabase CLI (personal access token)
  npm run db:link           Link this repo to the remote project
  npm run db:status         Show local vs remote migration status
  npm run db:push           Apply pending files from supabase/migrations
  npm run db:new -- name    Create a new empty migration file
  npm run db:repair -- <timestamp> applied|reverted
                            Fix migration history when SQL was applied manually

Legacy single-file apply (requires DATABASE_URL + pg)
  npm run db:apply -- supabase/migrations/20260725150000_development_updates.sql
`.trim());
}

function ensureLinkedHint() {
  const configPath = resolve(root, "supabase/.temp/project-ref");
  if (!existsSync(configPath)) {
    console.error(
      [
        "This directory is not linked to a remote Supabase project yet.",
        "Run: npm run db:link",
        "",
        "Ensure .env.local contains:",
        "  SUPABASE_DB_PASSWORD=your-database-password",
        "  NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co",
      ].join("\n")
    );
    process.exit(1);
  }
}

switch (command) {
  case "help":
  case "--help":
  case "-h": {
    printHelp();
    break;
  }
  case "login": {
    run("npx", supabaseArgs(["login"]));
    break;
  }
  case "link": {
    const ref = projectRefFromEnv();
    if (!ref) {
      console.error(
        [
          "Could not determine SUPABASE_PROJECT_REF.",
          "Set SUPABASE_PROJECT_REF in .env.local, or set NEXT_PUBLIC_SUPABASE_URL",
          "to https://YOUR_PROJECT_REF.supabase.co",
        ].join("\n")
      );
      process.exit(1);
    }
    const password = process.env.SUPABASE_DB_PASSWORD?.trim();
    const linkArgs = ["link", "--project-ref", ref];
    if (password) {
      linkArgs.push("--password", password);
    } else {
      console.log(
        "SUPABASE_DB_PASSWORD not set — the CLI will prompt for the database password."
      );
      console.log(
        "Tip: copy it from Connect → Database password, or reset it under Project Settings → Database."
      );
    }
    run("npx", supabaseArgs(linkArgs));
    break;
  }
  case "status":
  case "list": {
    ensureLinkedHint();
    run("npx", supabaseArgs(["migration", "list"]));
    break;
  }
  case "push": {
    ensureLinkedHint();
    const password = process.env.SUPABASE_DB_PASSWORD?.trim();
    const pushArgs = ["db", "push", "--yes"];
    if (password) {
      pushArgs.push("--password", password);
    }
    run("npx", supabaseArgs(pushArgs));
    break;
  }
  case "new": {
    const name = args[1];
    if (!name) {
      console.error("Usage: npm run db:new -- describe_your_change");
      process.exit(1);
    }
    run("npx", supabaseArgs(["migration", "new", name]));
    break;
  }
  case "repair": {
    ensureLinkedHint();
    const timestamp = args[1];
    const status = args[2];
    if (!timestamp || !["applied", "reverted"].includes(status)) {
      console.error(
        "Usage: npm run db:repair -- <migration_timestamp> applied|reverted"
      );
      process.exit(1);
    }
    run("npx", supabaseArgs(["migration", "repair", "--status", status, timestamp]));
    break;
  }
  case "apply": {
    // Legacy: apply one SQL file via DATABASE_URL (kept for emergencies).
    const sqlRel = args[1];
    if (!sqlRel) {
      console.error(
        "Usage: npm run db:apply -- supabase/migrations/YYYYMMDDHHMMSS_name.sql"
      );
      process.exit(1);
    }
    const sqlPath = resolve(root, sqlRel);
    if (!existsSync(sqlPath)) {
      console.error(`SQL file not found: ${sqlPath}`);
      process.exit(1);
    }
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      console.error(
        [
          "DATABASE_URL is not set.",
          "Prefer: npm run db:push",
          "",
          "Or set DATABASE_URL from the dashboard Connect panel (Session or Direct URI),",
          "then: npm install pg && npm run db:apply -- " + sqlRel,
        ].join("\n")
      );
      process.exit(1);
    }
    run("node", [resolve(root, "scripts/apply-sql-file.mjs"), sqlPath]);
    break;
  }
  default: {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
}
