#!/usr/bin/env node
/**
 * Legacy helper: apply a single SQL file using DATABASE_URL + pg.
 * Prefer `npm run db:push` for the normal migration workflow.
 */
import { readFileSync } from "node:fs";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("Usage: node scripts/apply-sql-file.mjs path/to/file.sql");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
const { default: pg } = await import("pg").catch(() => ({ default: null }));
if (!pg) {
  console.error("Install pg first: npm install pg");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  console.log(`Applied successfully: ${sqlPath}`);
} finally {
  await client.end();
}
