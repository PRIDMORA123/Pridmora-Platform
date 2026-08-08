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

export function getSupabaseUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return undefined;
  if (!isSupabaseProjectApiUrl(raw)) return undefined;
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
