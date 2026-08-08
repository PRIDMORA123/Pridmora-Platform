import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  categorizeAuthError,
  isAllowedEmailOtpType,
  logAuthRouteEvent,
  sanitizeNextPath,
  userFacingAuthErrorMessage,
} from "@/lib/auth/email-link";
import {
  buildPasswordRecoveryRedirectTo,
  resolveAuthCallbackNext,
  resolveAuthSiteOrigin,
} from "@/lib/auth/recovery";

describe("sanitizeNextPath", () => {
  it("allows safe relative paths", () => {
    expect(sanitizeNextPath("/auth/reset-password")).toBe("/auth/reset-password");
    expect(sanitizeNextPath("/")).toBe("/");
    expect(sanitizeNextPath("/?view=dashboard")).toBe("/?view=dashboard");
  });

  it("rejects open redirects", () => {
    expect(sanitizeNextPath("https://evil.example/phish")).toBe("/");
    expect(sanitizeNextPath("//evil.example")).toBe("/");
    expect(sanitizeNextPath("/\\evil.example")).toBe("/");
    expect(sanitizeNextPath("auth/reset-password")).toBe("/");
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/");
    expect(sanitizeNextPath("/auth/reset-password\n/evil")).toBe("/");
  });

  it("uses the provided fallback", () => {
    expect(sanitizeNextPath(null, "/auth/reset-password")).toBe("/auth/reset-password");
    expect(sanitizeNextPath("//evil", "/auth/reset-password")).toBe("/auth/reset-password");
  });
});

describe("email OTP type allowlist", () => {
  it("allows known email OTP types", () => {
    expect(isAllowedEmailOtpType("recovery")).toBe(true);
    expect(isAllowedEmailOtpType("signup")).toBe(true);
    expect(isAllowedEmailOtpType("email")).toBe(true);
  });

  it("rejects disallowed types", () => {
    expect(isAllowedEmailOtpType("sms")).toBe(false);
    expect(isAllowedEmailOtpType("admin")).toBe(false);
    expect(isAllowedEmailOtpType(null)).toBe(false);
    expect(isAllowedEmailOtpType("")).toBe(false);
  });
});

describe("auth error categorization and logging", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("categorizes PKCE verifier missing errors", () => {
    expect(
      categorizeAuthError({
        name: "AuthPKCECodeVerifierMissingError",
        code: "pkce_code_verifier_not_found",
        message: "PKCE code verifier not found in storage.",
      })
    ).toBe("pkce_verifier_missing");
  });

  it("categorizes expired or invalid errors", () => {
    expect(
      categorizeAuthError({
        name: "AuthApiError",
        code: "otp_expired",
        message: "Email link is invalid or has expired",
      })
    ).toBe("expired_or_invalid");
  });

  it("logs only safe structured fields", () => {
    logAuthRouteEvent("callback", {
      outcome: "failure",
      errorName: "AuthPKCECodeVerifierMissingError",
      errorCode: "pkce_code_verifier_not_found",
      category: "pkce_verifier_missing",
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(infoSpy.mock.calls[0][0]));
    expect(payload).toEqual({
      source: "auth_route",
      route: "callback",
      outcome: "failure",
      errorName: "AuthPKCECodeVerifierMissingError",
      errorCode: "pkce_code_verifier_not_found",
      category: "pkce_verifier_missing",
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/token_hash|auth_code|cookie|password|secret|eyJ/i);
    expect(serialized).not.toContain("PKCE code verifier not found");
  });

  it("maps categories to safe user-facing copy", () => {
    expect(userFacingAuthErrorMessage("expired_or_invalid")).toContain("expired");
    expect(userFacingAuthErrorMessage("missing_token_hash")).toContain("incomplete");
    expect(userFacingAuthErrorMessage("disallowed_type")).toContain("not valid");
  });
});

describe("password recovery redirect helpers", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
  });

  it("builds a callback redirectTo that preserves reset-password next", () => {
    expect(buildPasswordRecoveryRedirectTo("https://platform.pridmora.com")).toBe(
      "https://platform.pridmora.com/auth/callback?next=%2Fauth%2Freset-password"
    );
    expect(buildPasswordRecoveryRedirectTo("https://platform.pridmora.com/")).toBe(
      "https://platform.pridmora.com/auth/callback?next=%2Fauth%2Freset-password"
    );
  });

  it("prefers NEXT_PUBLIC_SITE_URL for recovery email redirects", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://platform.pridmora.com/";
    expect(resolveAuthSiteOrigin("http://localhost:3000")).toBe(
      "https://platform.pridmora.com"
    );
  });

  it("resolves recovery callback next away from the marketing homepage", () => {
    expect(
      resolveAuthCallbackNext({ next: null, type: "recovery" })
    ).toBe("/auth/reset-password");
    expect(
      resolveAuthCallbackNext({ next: "/", type: "recovery" })
    ).toBe("/auth/reset-password");
    expect(
      resolveAuthCallbackNext({ next: "/?view=dashboard", type: "recovery" })
    ).toBe("/auth/reset-password");
    expect(
      resolveAuthCallbackNext({
        next: "/auth/reset-password",
        type: "recovery",
      })
    ).toBe("/auth/reset-password");
    expect(resolveAuthCallbackNext({ next: null, type: null })).toBe("/");
    expect(
      resolveAuthCallbackNext({ next: "https://evil.example", type: "recovery" })
    ).toBe("/auth/reset-password");
  });
});
