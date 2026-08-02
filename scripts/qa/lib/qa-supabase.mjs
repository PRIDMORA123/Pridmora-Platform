/**
 * Supabase admin + authenticated-user helpers for multi-client QA.
 */
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const error = new Error("QA_SUPABASE_CONFIG: service role client unavailable");
    error.code = "QA_SUPABASE_CONFIG";
    throw error;
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const error = new Error("QA_SUPABASE_CONFIG: anon client unavailable");
    error.code = "QA_SUPABASE_CONFIG";
    throw error;
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function assertTableReadable(admin, table) {
  const { error } = await admin.from(table).select("*").limit(1);
  if (error) {
    const err = new Error(`QA_TABLE_MISSING: ${table}`);
    err.code = "QA_TABLE_MISSING";
    err.safeDetails = { table, status: error.code || null };
    throw err;
  }
}

export async function verifyRequiredTables(admin) {
  const tables = [
    "profiles",
    "clients",
    "sessions",
    "development_updates",
    "development_profiles",
    "coaching_moments",
  ];
  for (const table of tables) {
    await assertTableReadable(admin, table);
  }
  return tables;
}

export function cookieHeaderFromSession(session) {
  if (!session?.access_token || !session?.refresh_token) {
    const error = new Error("QA_AUTH_SESSION_MISSING");
    error.code = "QA_AUTH_SESSION_MISSING";
    throw error;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let projectRef = "unknown";
  try {
    projectRef = new URL(url).hostname.split(".")[0] || "unknown";
  } catch {
    projectRef = "unknown";
  }

  // @supabase/ssr cookie payload (single chunk when small enough).
  const payload = Buffer.from(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in ?? 3600,
      expires_at: session.expires_at,
      token_type: session.token_type || "bearer",
      user: session.user
        ? { id: session.user.id, email: session.user.email }
        : undefined,
    }),
    "utf8"
  ).toString("base64url");

  const name = `sb-${projectRef}-auth-token`;
  return {
    cookieHeader: `${name}=${payload}`,
    cookieName: name,
    projectRef,
  };
}

export async function signInForCookies(email, password) {
  const anon = createAnonClient();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    const err = new Error("QA_SIGN_IN_FAILED");
    err.code = "QA_SIGN_IN_FAILED";
    err.safeDetails = { status: error?.status || null };
    throw err;
  }
  const cookies = cookieHeaderFromSession(data.session);
  return {
    userId: data.user.id,
    accessTokenPresent: Boolean(data.session.access_token),
    ...cookies,
  };
}
