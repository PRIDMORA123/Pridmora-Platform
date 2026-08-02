/**
 * Migration-chain bootstrap test.
 *
 * Static checks always run.
 * Full local reset (Docker + `supabase db reset`) runs only when:
 *   RUN_MIGRATION_CHAIN_TEST=1
 * or when Docker is available and RUN_MIGRATION_CHAIN_TEST is not "0".
 *
 * Never targets a remote / linked cloud project.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(__dirname, "..");
const migrationsDir = join(root, "supabase", "migrations");
const bootstrapName = "20260724150000_core_tables_bootstrap.sql";

function listMigrationSqlFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function dockerAvailable(): boolean {
  const result = spawnSync("docker", ["info"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  return result.status === 0;
}

function shouldRunLocalReset(): boolean {
  const flag = process.env.RUN_MIGRATION_CHAIN_TEST?.trim();
  if (flag === "0") return false;
  if (flag === "1") return true;
  return dockerAvailable();
}

describe("migration chain — static audit", () => {
  it("includes the lean core bootstrap before the historical chain", () => {
    const files = listMigrationSqlFiles();
    expect(files[0]).toBe(bootstrapName);

    const bootstrap = readFileSync(join(migrationsDir, bootstrapName), "utf8");
    const body = stripSqlComments(bootstrap).toLowerCase();

    expect(body).toContain("create table if not exists public.clients");
    expect(body).toContain("create table if not exists public.sessions");
    expect(body).toContain("create table if not exists public.client_items");

    // Must not pre-create objects owned by later migrations / org work.
    expect(body).not.toContain("create table if not exists public.profiles");
    expect(body).not.toContain("create table if not exists public.coaching_reports");
    expect(body).not.toContain("create table if not exists public.organisations");
    expect(body).not.toMatch(/licence_/);
    expect(body).not.toMatch(/\binsert\s+into\b/);
  });

  it("ensures no later migration creates clients/sessions/client_items", () => {
    const files = listMigrationSqlFiles().filter((f) => f !== bootstrapName);
    for (const file of files) {
      const sql = stripSqlComments(
        readFileSync(join(migrationsDir, file), "utf8")
      ).toLowerCase();
      expect(sql, file).not.toMatch(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.clients\b/
      );
      expect(sql, file).not.toMatch(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.sessions\b/
      );
      expect(sql, file).not.toMatch(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.client_items\b/
      );
    }
  });

  it("marks schema.sql as a non-authoritative development snapshot", () => {
    const schemaPath = join(root, "supabase", "schema.sql");
    expect(existsSync(schemaPath)).toBe(true);
    const header = readFileSync(schemaPath, "utf8").slice(0, 800).toLowerCase();
    expect(header).toContain("development");
    expect(header).toContain("reference");
    expect(header).toContain("authoritative deployment path");
    expect(header).toContain("supabase/migrations");
  });

  it("static dependency audit: core tables exist before first consumer", () => {
    const files = listMigrationSqlFiles();
    const created = new Set<string>();
    const assumedMissing: { file: string; table: string }[] = [];

    for (const file of files) {
      const sql = stripSqlComments(
        readFileSync(join(migrationsDir, file), "utf8")
      );
      for (const m of sql.matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi
      )) {
        created.add(m[1].toLowerCase());
      }

      const needed = new Set<string>();
      for (const m of sql.matchAll(
        /alter\s+table\s+public\.(clients|sessions|client_items)\b/gi
      )) {
        needed.add(m[1].toLowerCase());
      }
      for (const m of sql.matchAll(
        /references\s+public\.(clients|sessions|client_items)\b/gi
      )) {
        needed.add(m[1].toLowerCase());
      }
      for (const m of sql.matchAll(
        /(?:from|join|update|into)\s+public\.(clients|sessions|client_items)\b/gi
      )) {
        needed.add(m[1].toLowerCase());
      }

      for (const table of needed) {
        if (!created.has(table)) {
          assumedMissing.push({ file, table });
        }
      }
    }

    expect(assumedMissing).toEqual([]);
  });
});

describe("migration chain — local db reset", () => {
  const runLocalReset = shouldRunLocalReset();

  it.skipIf(!runLocalReset)(
    "applies the full migration chain on a blank local database",
    () => {
      const reset = spawnSync("npx", ["supabase", "db", "reset", "--yes"], {
        cwd: root,
        encoding: "utf8",
        timeout: 600_000,
        env: { ...process.env },
      });

      if (reset.status !== 0) {
        console.error(reset.stdout);
        console.error(reset.stderr);
      }
      expect(reset.status, reset.stderr || reset.stdout).toBe(0);

      const sqlCount = listMigrationSqlFiles().length;
      const query = spawnSync(
        "npx",
        [
          "supabase",
          "db",
          "query",
          `
            select
              to_regclass('public.clients') is not null as has_clients,
              to_regclass('public.sessions') is not null as has_sessions,
              to_regclass('public.client_items') is not null as has_client_items,
              to_regclass('public.organisations') is not null as has_organisations,
              to_regclass('public.profiles') is not null as has_profiles,
              (
                select count(*)::int
                from supabase_migrations.schema_migrations
              ) as migration_count;
          `,
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 60_000,
          env: { ...process.env },
        }
      );

      if (query.status !== 0) {
        console.error(query.stdout);
        console.error(query.stderr);
      }
      expect(query.status, query.stderr || query.stdout).toBe(0);

      const out = `${query.stdout}\n${query.stderr}`.toLowerCase();
      expect(out).toContain("has_clients");
      expect(out).toContain("has_sessions");
      expect(out).toContain("has_client_items");
      expect(out).toContain("has_organisations");
      expect(out).toContain("has_profiles");
      expect(out).toMatch(new RegExp(`\\b${sqlCount}\\b`));
    },
    700_000
  );

  it.skipIf(runLocalReset)(
    "documents that the full SQL chain was not executed (Docker unavailable)",
    () => {
      // Intentionally empty: marks the gap clearly in vitest output when
      // Docker is missing so we never claim a blank DB was initialised.
      expect(dockerAvailable()).toBe(false);
    }
  );
});
