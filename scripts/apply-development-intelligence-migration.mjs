/**
 * @deprecated Prefer the repeatable CLI workflow:
 *   npm run db:push
 *
 * Legacy single-file apply for
 * supabase/migrations/20260725140000_development_intelligence.sql
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const sqlRel = "supabase/migrations/20260725140000_development_intelligence.sql";

console.log(
  [
    "Note: Prefer `npm run db:push` for repeatable migrations.",
    `Falling back to single-file apply for ${sqlRel}`,
    "",
  ].join("\n")
);

const result = spawnSync(
  process.execPath,
  [resolve(root, "scripts/db.mjs"), "apply", sqlRel],
  { cwd: root, stdio: "inherit", env: process.env }
);
process.exit(result.status ?? 1);
