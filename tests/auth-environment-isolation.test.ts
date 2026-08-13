import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PILOT_PROJECT_REF,
  IDENTITY_PROJECT_REF,
  PILOT_LOCAL_ORIGIN,
  IDENTITY_LOCAL_ORIGIN,
  PILOT_PRODUCTION_ORIGIN,
  IDENTITY_PRODUCTION_ORIGIN,
  PRODUCTION_SITE_ORIGIN,
  assertCanonicalSiteOrigin,
  assertProductionAuthSiteOrigin,
  assertSupabaseProjectIsolation,
  extractSupabaseProjectRef,
  getCanonicalSiteOrigin,
  isNonProductionSiteOrigin,
  resolveAuthEnvironmentName,
  resolveDeclaredAuthEnvironment,
} from "@/lib/supabase/project-env";
import {
  buildPasswordRecoveryRedirectTo,
  resolveAuthSiteOrigin,
} from "@/lib/auth/recovery";

describe("Supabase environment isolation", () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    expected: process.env.PRIDMORA_EXPECTED_SUPABASE_REF,
    authExpected: process.env.AUTH_EXPECTED_PROJECT_REF,
    envName: process.env.PRIDMORA_ENV,
    site: process.env.NEXT_PUBLIC_SITE_URL,
    nodeEnv: process.env.NODE_ENV,
  };

  afterEach(() => {
    restore("NEXT_PUBLIC_SUPABASE_URL", previous.url);
    restore("PRIDMORA_EXPECTED_SUPABASE_REF", previous.expected);
    restore("AUTH_EXPECTED_PROJECT_REF", previous.authExpected);
    restore("PRIDMORA_ENV", previous.envName);
    restore("NEXT_PUBLIC_SITE_URL", previous.site);
    vi.unstubAllEnvs();
  });

  function restore(key: string, value: string | undefined) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }

  it("extracts Pilot and IDENTITY refs and never confuses them", () => {
    expect(
      extractSupabaseProjectRef(`https://${PILOT_PROJECT_REF}.supabase.co`)
    ).toBe(PILOT_PROJECT_REF);
    expect(
      extractSupabaseProjectRef(`https://${IDENTITY_PROJECT_REF}.supabase.co`)
    ).toBe(IDENTITY_PROJECT_REF);
    expect(resolveAuthEnvironmentName(PILOT_PROJECT_REF)).toBe("pilot");
    expect(resolveAuthEnvironmentName(IDENTITY_PROJECT_REF)).toBe("identity");
    expect(PILOT_PROJECT_REF).not.toBe(IDENTITY_PROJECT_REF);
    expect(PILOT_PRODUCTION_ORIGIN).toBe("https://pilot.pridmora.com");
    expect(IDENTITY_PRODUCTION_ORIGIN).toBe("https://platform.pridmora.com");
    expect(PRODUCTION_SITE_ORIGIN).toBe(IDENTITY_PRODUCTION_ORIGIN);
  });

  it("Pilot production canonical origin is pilot.pridmora.com", () => {
    expect(getCanonicalSiteOrigin("pilot", "production")).toBe(
      PILOT_PRODUCTION_ORIGIN
    );
    expect(
      assertCanonicalSiteOrigin({
        environment: "pilot",
        siteUrl: PILOT_PRODUCTION_ORIGIN,
        nodeEnv: "production",
      }).ok
    ).toBe(true);
  });

  it("Identity production canonical origin is platform.pridmora.com", () => {
    expect(getCanonicalSiteOrigin("identity", "production")).toBe(
      IDENTITY_PRODUCTION_ORIGIN
    );
    expect(
      assertCanonicalSiteOrigin({
        environment: "identity",
        siteUrl: IDENTITY_PRODUCTION_ORIGIN,
        nodeEnv: "production",
      }).ok
    ).toBe(true);
  });

  it("Pilot refuses platform.pridmora.com as canonical origin", () => {
    const result = assertCanonicalSiteOrigin({
      environment: "pilot",
      siteUrl: IDENTITY_PRODUCTION_ORIGIN,
      nodeEnv: "production",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ORIGIN_MISMATCH");
      expect(result.message).toContain(PILOT_PRODUCTION_ORIGIN);
    }
  });

  it("Identity refuses pilot.pridmora.com as canonical origin", () => {
    const result = assertCanonicalSiteOrigin({
      environment: "identity",
      siteUrl: PILOT_PRODUCTION_ORIGIN,
      nodeEnv: "production",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ORIGIN_MISMATCH");
      expect(result.message).toContain(IDENTITY_PRODUCTION_ORIGIN);
    }
  });

  it("fails fast when Pilot process is pointed at IDENTITY", () => {
    process.env.PRIDMORA_ENV = "pilot";
    const result = assertSupabaseProjectIsolation(
      `https://${IDENTITY_PROJECT_REF}.supabase.co`
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PROJECT_REF_MISMATCH");
      expect(result.expectedRef).toBe(PILOT_PROJECT_REF);
      expect(result.actualRef).toBe(IDENTITY_PROJECT_REF);
    }
  });

  it("fails fast when Identity process is pointed at Pilot", () => {
    process.env.PRIDMORA_ENV = "identity";
    const result = assertSupabaseProjectIsolation(
      `https://${PILOT_PROJECT_REF}.supabase.co`
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PROJECT_REF_MISMATCH");
      expect(result.expectedRef).toBe(IDENTITY_PROJECT_REF);
      expect(result.actualRef).toBe(PILOT_PROJECT_REF);
    }
  });

  it("accepts Pilot URL when Pilot is expected", () => {
    process.env.PRIDMORA_EXPECTED_SUPABASE_REF = PILOT_PROJECT_REF;
    const result = assertSupabaseProjectIsolation(
      `https://${PILOT_PROJECT_REF}.supabase.co`
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.environment).toBe("pilot");
    }
  });

  it("getSupabaseUrl throws on Pilot/IDENTITY mismatch when expected is set", async () => {
    vi.resetModules();
    process.env.PRIDMORA_ENV = "pilot";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${IDENTITY_PROJECT_REF}.supabase.co`;
    const { getSupabaseUrl } = await import("@/lib/supabase/env");
    expect(() => getSupabaseUrl()).toThrow(/project ref mismatch/i);
  });

  it("rejects localhost / LAN / preview origins for production emails", () => {
    expect(isNonProductionSiteOrigin("http://localhost:3001")).toBe(true);
    expect(isNonProductionSiteOrigin("http://127.0.0.1:3001")).toBe(true);
    expect(isNonProductionSiteOrigin("http://192.168.0.77:3001")).toBe(true);
    expect(isNonProductionSiteOrigin("https://foo.vercel.app")).toBe(true);
    expect(isNonProductionSiteOrigin(IDENTITY_PRODUCTION_ORIGIN)).toBe(false);
    expect(isNonProductionSiteOrigin(PILOT_PRODUCTION_ORIGIN)).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PRIDMORA_ENV", "identity");
    expect(assertProductionAuthSiteOrigin("http://127.0.0.1:3001").ok).toBe(
      false
    );
    expect(assertProductionAuthSiteOrigin(IDENTITY_PRODUCTION_ORIGIN).ok).toBe(
      true
    );
    expect(assertProductionAuthSiteOrigin(PILOT_PRODUCTION_ORIGIN).ok).toBe(
      false
    );

    vi.stubEnv("PRIDMORA_ENV", "pilot");
    expect(assertProductionAuthSiteOrigin(PILOT_PRODUCTION_ORIGIN).ok).toBe(
      true
    );
    expect(assertProductionAuthSiteOrigin(IDENTITY_PRODUCTION_ORIGIN).ok).toBe(
      false
    );
  });

  it("enforces canonical local origins and rejects localhost", () => {
    expect(
      assertCanonicalSiteOrigin({
        environment: "pilot",
        siteUrl: PILOT_LOCAL_ORIGIN,
        nodeEnv: "development",
      }).ok
    ).toBe(true);
    expect(
      assertCanonicalSiteOrigin({
        environment: "identity",
        siteUrl: IDENTITY_LOCAL_ORIGIN,
        nodeEnv: "development",
      }).ok
    ).toBe(true);
    const localhost = assertCanonicalSiteOrigin({
      environment: "pilot",
      siteUrl: "http://localhost:3001",
      nodeEnv: "development",
    });
    expect(localhost.ok).toBe(false);
    if (!localhost.ok) {
      expect(localhost.code).toBe("ORIGIN_AMBIGUOUS_LOCALHOST");
    }
    const wrongPort = assertCanonicalSiteOrigin({
      environment: "pilot",
      siteUrl: "http://127.0.0.1:3000",
      nodeEnv: "development",
    });
    expect(wrongPort.ok).toBe(false);
  });

  it("password recovery Pilot production URL uses pilot.pridmora.com", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PRIDMORA_ENV", "pilot");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PILOT_PRODUCTION_ORIGIN);

    expect(resolveDeclaredAuthEnvironment()).toBe("pilot");
    const origin = resolveAuthSiteOrigin("http://127.0.0.1:3001");
    expect(origin).toBe(PILOT_PRODUCTION_ORIGIN);
    expect(buildPasswordRecoveryRedirectTo(origin)).toBe(
      `${PILOT_PRODUCTION_ORIGIN}/auth/reset-password`
    );
    expect(() =>
      buildPasswordRecoveryRedirectTo(IDENTITY_PRODUCTION_ORIGIN)
    ).toThrow(/pilot\.pridmora\.com/i);
  });

  it("production Identity recovery redirectTo cannot resolve to localhost or Pilot host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PRIDMORA_ENV", "identity");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");

    expect(() => resolveAuthSiteOrigin("http://localhost:3001")).toThrow(
      /platform\.pridmora\.com/i
    );

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", IDENTITY_PRODUCTION_ORIGIN);
    const origin = resolveAuthSiteOrigin("http://localhost:3001");
    expect(origin).toBe(IDENTITY_PRODUCTION_ORIGIN);
    expect(buildPasswordRecoveryRedirectTo(origin)).toBe(
      `${IDENTITY_PRODUCTION_ORIGIN}/auth/reset-password`
    );
    expect(() =>
      buildPasswordRecoveryRedirectTo(PILOT_PRODUCTION_ORIGIN)
    ).toThrow(/platform\.pridmora\.com/i);
  });
});
