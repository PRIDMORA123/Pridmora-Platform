import {
  assertSupabaseProjectIsolation,
  extractSupabaseProjectRef,
} from "@/lib/supabase/project-env";

/**
 * True when `value` is a Supabase project API origin (Auth lives at {url}/auth/v1/...).
 * Rejects application site URLs such as https://platform.pridmora.com which must
 * never be used as NEXT_PUBLIC_SUPABASE_URL.
 */
export function isSupabaseProjectApiUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") {
      return true;
    }
    return host.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

let isolationWarned = false;

/**
 * When PRIDMORA_ENV / PRIDMORA_EXPECTED_SUPABASE_REF is set, fail closed if the
 * configured project ref does not match. Throws on mismatch so Pilot can never
 * silently initialise an IDENTITY client (and vice versa).
 */
export function enforceSupabaseProjectIsolation(): void {
  const result = assertSupabaseProjectIsolation(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  if (result.ok) return;
  if (result.code === "PROJECT_REF_MISMATCH") {
    throw new Error(result.message);
  }
  // Missing/invalid URL is handled by callers as "not configured".
  if (process.env.NODE_ENV !== "production" && !isolationWarned) {
    isolationWarned = true;
    console.warn(
      JSON.stringify({
        source: "supabase_env",
        code: result.code,
        message: result.message,
        actualRef: result.actualRef,
        expectedRef: result.expectedRef,
      })
    );
  }
}

export function getSupabaseUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return undefined;
  if (!isSupabaseProjectApiUrl(raw)) return undefined;

  const expected = process.env.PRIDMORA_EXPECTED_SUPABASE_REF?.trim() ||
    process.env.AUTH_EXPECTED_PROJECT_REF?.trim() ||
    (process.env.PRIDMORA_ENV?.trim().toLowerCase() === "pilot"
      ? "jfcxnkmflfzzxqovkuqw"
      : process.env.PRIDMORA_ENV?.trim().toLowerCase() === "identity"
        ? "lxfdhnwjmtfbawznivbu"
        : null);

  if (expected) {
    const actual = extractSupabaseProjectRef(raw);
    if (actual && actual !== expected.toLowerCase()) {
      throw new Error(
        `Supabase project ref mismatch: expected ${expected}, got ${actual}. Check .env.pilot.local vs .env.local and shell exports.`
      );
    }
  }

  return raw.replace(/\/$/, "");
}

export function getSupabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || undefined;
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function isSupabaseServiceRoleConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(getSupabaseServiceRoleKey());
}
