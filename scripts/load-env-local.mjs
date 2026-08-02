import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load KEY=VALUE pairs from .env.local into process.env without overriding
 * values already present in the shell environment.
 */
export function loadEnvLocal(cwd = process.cwd()) {
  const path = resolve(cwd, ".env.local");
  if (!existsSync(path)) return { path, loaded: false, keys: [] };

  const keys = [];
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
      keys.push(key);
    }
  }
  return { path, loaded: true, keys };
}

export function projectRefFromEnv() {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return "";
  try {
    const host = new URL(url).hostname; // e.g. lxfdhnwjmtfbawznivbu.supabase.co
    const ref = host.split(".")[0] || "";
    return ref.includes("supabase") ? "" : ref;
  } catch {
    return "";
  }
}
