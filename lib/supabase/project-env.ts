/**
 * Canonical Supabase project / site-origin resolution for Pilot vs IDENTITY.
 * Never logs service-role keys or anon keys.
 *
 * Environments remain completely separate:
 * - Pilot public:  https://pilot.pridmora.com  → jfcxnkmflfzzxqovkuqw
 * - Identity public: https://platform.pridmora.com → lxfdhnwjmtfbawznivbu
 */

export const PILOT_PROJECT_REF = "jfcxnkmflfzzxqovkuqw";
export const IDENTITY_PROJECT_REF = "lxfdhnwjmtfbawznivbu";

/** IDENTITY / existing production public origin. */
export const IDENTITY_PRODUCTION_ORIGIN = "https://platform.pridmora.com";
/** Customer #1 Pilot public origin. */
export const PILOT_PRODUCTION_ORIGIN = "https://pilot.pridmora.com";
/**
 * Legacy alias for IDENTITY production public origin.
 * Prefer IDENTITY_PRODUCTION_ORIGIN or getCanonicalSiteOrigin(environment).
 */
export const PRODUCTION_SITE_ORIGIN = IDENTITY_PRODUCTION_ORIGIN;

/** Local Pilot — never use localhost interchangeably. */
export const PILOT_LOCAL_ORIGIN = "http://127.0.0.1:3001";
/** Local IDENTITY — never use localhost interchangeably. */
export const IDENTITY_LOCAL_ORIGIN = "http://127.0.0.1:3000";

export type AuthEnvironmentName = "pilot" | "identity" | "unknown";

export type CanonicalOriginResult =
  | { ok: true; origin: string; environment: AuthEnvironmentName }
  | {
      ok: false;
      code: "ORIGIN_MISMATCH" | "ORIGIN_AMBIGUOUS_LOCALHOST" | "ORIGIN_MISSING";
      message: string;
    };

/**
 * Declared auth environment from PRIDMORA_ENV / expected ref / Supabase URL.
 * Never inferred from NODE_ENV alone.
 *
 * Client bundles: the Supabase URL fallback must use a *direct*
 * `process.env.NEXT_PUBLIC_SUPABASE_URL` read so Next.js can inline it.
 * Indirect `env.NEXT_PUBLIC_*` access via a `process.env` parameter is
 * undefined in the browser and previously forced environment → "unknown".
 */
export function resolveDeclaredAuthEnvironment(
  env: NodeJS.ProcessEnv = process.env
): AuthEnvironmentName {
  const named = env.PRIDMORA_ENV?.trim().toLowerCase();
  if (named === "pilot" || named === "identity") return named;

  const explicit =
    env.PRIDMORA_EXPECTED_SUPABASE_REF?.trim().toLowerCase() ||
    env.AUTH_EXPECTED_PROJECT_REF?.trim().toLowerCase();
  if (explicit === PILOT_PROJECT_REF) return "pilot";
  if (explicit === IDENTITY_PROJECT_REF) return "identity";

  // Prefer explicit env overrides (tests/server). Default path uses a direct
  // NEXT_PUBLIC_* read for client-bundle inlining.
  const supabaseUrl =
    env !== process.env
      ? env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_URL;

  return resolveAuthEnvironmentName(extractSupabaseProjectRef(supabaseUrl));
}

/**
 * Authoritative canonical site origin for a named auth environment.
 */
export function getCanonicalSiteOrigin(
  environment: AuthEnvironmentName,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string | null {
  const isProd = nodeEnv === "production";
  if (environment === "pilot") {
    return isProd ? PILOT_PRODUCTION_ORIGIN : PILOT_LOCAL_ORIGIN;
  }
  if (environment === "identity") {
    return isProd ? IDENTITY_PRODUCTION_ORIGIN : IDENTITY_LOCAL_ORIGIN;
  }
  return null;
}

/**
 * Fail closed when Site URL / APP_URL is missing, uses localhost, or does not
 * match the canonical origin for the declared environment.
 */
export function assertCanonicalSiteOrigin(input?: {
  siteUrl?: string | null;
  appUrl?: string | null;
  environment?: AuthEnvironmentName | null;
  nodeEnv?: string | null;
}): CanonicalOriginResult {
  const environment =
    input?.environment ??
    resolveDeclaredAuthEnvironment();

  const raw =
    (input?.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL)?.trim() ||
    (input?.appUrl ?? process.env.APP_URL)?.trim() ||
    "";

  if (!raw) {
    return {
      ok: false,
      code: "ORIGIN_MISSING",
      message:
        "NEXT_PUBLIC_SITE_URL (or APP_URL) must be set to the canonical environment origin.",
    };
  }

  let origin = raw.replace(/\/$/, "");
  try {
    const parsed = new URL(origin);
    origin = `${parsed.protocol}//${parsed.host}`;
    if (parsed.hostname.toLowerCase() === "localhost") {
      return {
        ok: false,
        code: "ORIGIN_AMBIGUOUS_LOCALHOST",
        message:
          "localhost is not a canonical auth origin (cookie jar differs from 127.0.0.1). Use 127.0.0.1.",
      };
    }
  } catch {
    return {
      ok: false,
      code: "ORIGIN_MISMATCH",
      message: "NEXT_PUBLIC_SITE_URL is not a valid absolute URL.",
    };
  }

  const expected = getCanonicalSiteOrigin(
    environment,
    input?.nodeEnv ?? process.env.NODE_ENV
  );
  if (expected && origin !== expected) {
    return {
      ok: false,
      code: "ORIGIN_MISMATCH",
      message: `Canonical origin mismatch for ${environment}: expected ${expected}, got ${origin}.`,
    };
  }

  return {
    ok: true,
    origin,
    environment: environment === "unknown" ? "unknown" : environment,
  };
}

/**
 * Combined project-ref + canonical-origin gate. Throw-safe helper for boot.
 * Full fail-closed checks apply when PRIDMORA_ENV / expected ref is declared.
 */
export function assertAuthRuntimeConfigOrThrow(): {
  projectRef: string | null;
  environment: AuthEnvironmentName;
  origin: string;
  pinned: boolean;
} {
  const expected = getExpectedSupabaseProjectRef();
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.APP_URL?.trim() || "";

  if (site) {
    try {
      if (new URL(site).hostname.toLowerCase() === "localhost") {
        throw new Error(
          "[auth-env] ORIGIN_AMBIGUOUS_LOCALHOST: use 127.0.0.1, not localhost."
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("[auth-env]")) {
        throw error;
      }
      throw new Error("[auth-env] ORIGIN_MISMATCH: NEXT_PUBLIC_SITE_URL is invalid.");
    }
  }

  const project = assertSupabaseProjectIsolation();
  if (!project.ok) {
    if (expected || project.code === "PROJECT_REF_MISMATCH") {
      throw new Error(`[auth-env] ${project.code}: ${project.message}`);
    }
    return {
      projectRef: project.actualRef,
      environment: "unknown",
      origin: site.replace(/\/$/, ""),
      pinned: false,
    };
  }

  if (!expected) {
    return {
      projectRef: project.projectRef,
      environment: project.environment,
      origin: site.replace(/\/$/, ""),
      pinned: false,
    };
  }

  if (project.environment === "unknown") {
    throw new Error(
      "[auth-env] PROJECT_REF_UNKNOWN: configured Supabase URL is neither Pilot nor IDENTITY."
    );
  }

  // Declared env name must agree with the Supabase project actually configured.
  const declared = resolveDeclaredAuthEnvironment();
  if (declared !== "unknown" && declared !== project.environment) {
    throw new Error(
      `[auth-env] ENV_PROJECT_MISMATCH: PRIDMORA_ENV=${declared} but Supabase project is ${project.environment}.`
    );
  }

  const origin = assertCanonicalSiteOrigin({
    environment: project.environment,
  });
  if (!origin.ok) {
    throw new Error(`[auth-env] ${origin.code}: ${origin.message}`);
  }

  return {
    projectRef: project.projectRef,
    environment: project.environment,
    origin: origin.origin,
    pinned: true,
  };
}

/**
 * Extract Supabase project ref from NEXT_PUBLIC_SUPABASE_URL hostname.
 * Returns null when URL is missing or not a *.supabase.co host.
 */
export function extractSupabaseProjectRef(
  supabaseUrl: string | null | undefined
): string | null {
  if (!supabaseUrl?.trim()) return null;
  try {
    const host = new URL(supabaseUrl.trim()).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function resolveAuthEnvironmentName(
  projectRef: string | null | undefined
): AuthEnvironmentName {
  if (projectRef === PILOT_PROJECT_REF) return "pilot";
  if (projectRef === IDENTITY_PROJECT_REF) return "identity";
  return "unknown";
}

/**
 * Expected project ref for this process.
 * Prefer explicit PRIDMORA_EXPECTED_SUPABASE_REF / AUTH_EXPECTED_PROJECT_REF.
 * When PRIDMORA_ENV=pilot|identity, map to the frozen refs.
 */
export function getExpectedSupabaseProjectRef(): string | null {
  const explicit =
    process.env.PRIDMORA_EXPECTED_SUPABASE_REF?.trim() ||
    process.env.AUTH_EXPECTED_PROJECT_REF?.trim();
  if (explicit) return explicit.toLowerCase();

  const named = process.env.PRIDMORA_ENV?.trim().toLowerCase();
  if (named === "pilot") return PILOT_PROJECT_REF;
  if (named === "identity") return IDENTITY_PROJECT_REF;
  return null;
}

export type EnvIsolationResult =
  | { ok: true; projectRef: string; environment: AuthEnvironmentName }
  | {
      ok: false;
      code: "MISSING_SUPABASE_URL" | "INVALID_SUPABASE_URL" | "PROJECT_REF_MISMATCH";
      message: string;
      actualRef: string | null;
      expectedRef: string | null;
    };

/**
 * Fail-fast when the process is pinned to an expected project and the
 * configured NEXT_PUBLIC_SUPABASE_URL resolves to a different ref.
 */
export function assertSupabaseProjectIsolation(
  supabaseUrl: string | null | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): EnvIsolationResult {
  const actualRef = extractSupabaseProjectRef(supabaseUrl);
  if (!supabaseUrl?.trim()) {
    return {
      ok: false,
      code: "MISSING_SUPABASE_URL",
      message: "NEXT_PUBLIC_SUPABASE_URL is not set.",
      actualRef: null,
      expectedRef: getExpectedSupabaseProjectRef(),
    };
  }
  if (!actualRef) {
    return {
      ok: false,
      code: "INVALID_SUPABASE_URL",
      message:
        "NEXT_PUBLIC_SUPABASE_URL must be https://<project-ref>.supabase.co.",
      actualRef: null,
      expectedRef: getExpectedSupabaseProjectRef(),
    };
  }

  const expectedRef = getExpectedSupabaseProjectRef();
  if (expectedRef && actualRef !== expectedRef) {
    return {
      ok: false,
      code: "PROJECT_REF_MISMATCH",
      message: `Supabase project ref mismatch: expected ${expectedRef}, got ${actualRef}. Check .env.pilot.local vs .env.local and shell exports.`,
      actualRef,
      expectedRef,
    };
  }

  return {
    ok: true,
    projectRef: actualRef,
    environment: resolveAuthEnvironmentName(actualRef),
  };
}

/** True for loopback / LAN origins that must never appear in production emails. */
export function isNonProductionSiteOrigin(origin: string): boolean {
  try {
    const url = new URL(origin.trim());
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return true;
    }
    if (
      /^192\.168\./.test(host) ||
      /^10\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return true;
    }
    if (host.endsWith(".vercel.app")) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Production auth email redirects must use the canonical origin for the
 * declared environment (Pilot → pilot.pridmora.com, Identity → platform).
 */
export function assertProductionAuthSiteOrigin(
  origin: string,
  options?: { environment?: AuthEnvironmentName }
): {
  ok: boolean;
  message?: string;
} {
  const normalised = origin.trim().replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") {
    return { ok: true };
  }
  if (isNonProductionSiteOrigin(normalised)) {
    const environment =
      options?.environment ?? resolveDeclaredAuthEnvironment();
    const expected =
      getCanonicalSiteOrigin(environment, "production") ??
      IDENTITY_PRODUCTION_ORIGIN;
    return {
      ok: false,
      message: `Production auth emails must not use localhost, LAN, or preview URLs. Set NEXT_PUBLIC_SITE_URL=${expected}.`,
    };
  }

  const environment =
    options?.environment ?? resolveDeclaredAuthEnvironment();
  const expected = getCanonicalSiteOrigin(environment, "production");
  if (!expected) {
    return {
      ok: false,
      message:
        "Production auth origin cannot be validated without PRIDMORA_ENV=pilot|identity (or matching Supabase project ref).",
    };
  }
  if (normalised !== expected) {
    return {
      ok: false,
      message: `Production NEXT_PUBLIC_SITE_URL must be ${expected}.`,
    };
  }
  return { ok: true };
}
