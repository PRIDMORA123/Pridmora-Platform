import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logAuthClientDiagnostic,
  mapAuthClientError,
} from "@/lib/auth/client-errors";

describe("auth client error observability", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("maps invalid credentials without exposing provider internals to customers", () => {
    const mapped = mapAuthClientError(
      {
        name: "AuthApiError",
        message: "Invalid login credentials",
        code: "invalid_credentials",
        status: 400,
      },
      "sign_in"
    );
    expect(mapped.kind).toBe("invalid_credentials");
    expect(mapped.userMessage).toMatch(/check your email and password/i);
    expect(mapped.code).toBe("invalid_credentials");
  });

  it("maps email-not-confirmed distinctly", () => {
    const mapped = mapAuthClientError(
      { message: "Email not confirmed", code: "email_not_confirmed", status: 400 },
      "sign_in"
    );
    expect(mapped.kind).toBe("email_not_confirmed");
    expect(mapped.userMessage).toMatch(/confirm your email/i);
  });

  it("does not treat every HTTP 400 as invalid credentials", () => {
    const mapped = mapAuthClientError(
      {
        name: "AuthApiError",
        message: "Unsupported grant type",
        code: "validation_failed",
        status: 400,
      },
      "sign_in"
    );
    expect(mapped.kind).toBe("auth_rejected");
    expect(mapped.publicCode).toBe("AUTH_REJECTED");
    expect(mapped.userMessage).not.toMatch(/check your email and password/i);
  });

  it("maps rate limits for forgot-password", () => {
    const mapped = mapAuthClientError(
      {
        message: "For security purposes, you can only request this after 60 seconds.",
        code: "over_email_send_rate_limit",
        status: 429,
      },
      "forgot_password"
    );
    expect(mapped.kind).toBe("rate_limited");
    expect(mapped.userMessage).toMatch(/too many reset requests/i);
  });

  it("maps expired recovery verification", () => {
    const mapped = mapAuthClientError(
      {
        message: "Email link is invalid or has expired",
        code: "otp_expired",
        status: 403,
      },
      "verify_recovery"
    );
    expect(mapped.kind).toBe("reset_link_invalid");
  });

  it("logs diagnostic codes in development without secrets", () => {
    vi.stubEnv("NODE_ENV", "development");
    const mapped = mapAuthClientError(
      {
        message: "Invalid login credentials",
        code: "invalid_credentials",
        status: 400,
        name: "AuthApiError",
      },
      "sign_in"
    );
    logAuthClientDiagnostic("sign_in", mapped, {
      message: "Invalid login credentials",
      code: "invalid_credentials",
      status: 400,
      name: "AuthApiError",
    });
    expect(infoSpy).toHaveBeenCalled();
    const payload = String(infoSpy.mock.calls[0]?.[0] ?? "");
    expect(payload).toContain("invalid_credentials");
    expect(payload).not.toContain("password");
    expect(payload).not.toContain("token");
    vi.unstubAllEnvs();
  });
});
