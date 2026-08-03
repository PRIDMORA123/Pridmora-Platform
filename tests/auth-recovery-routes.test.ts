import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

const envMocks = vi.hoisted(() => ({
  url: "https://example.supabase.co",
  anonKey: "test-anon-key",
}));

vi.mock("@/lib/supabase/env", () => ({
  getSupabaseUrl: () => envMocks.url,
  getSupabaseAnonKey: () => envMocks.anonKey,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: authMocks.exchangeCodeForSession,
      verifyOtp: authMocks.verifyOtp,
    },
  }),
}));

describe("auth confirm route (token hash recovery)", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    authMocks.exchangeCodeForSession.mockReset();
    authMocks.verifyOtp.mockReset();
    envMocks.url = "https://example.supabase.co";
    envMocks.anonKey = "test-anon-key";
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.resetModules();
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  async function getConfirm() {
    const mod = await import("@/app/auth/confirm/route");
    return mod.GET;
  }

  it("verifies a valid recovery token hash and redirects to reset-password", async () => {
    authMocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "x" } }, error: null });
    const GET = await getConfirm();

    const response = await GET(
      new Request(
        "https://app.pridmora.com/auth/confirm?token_hash=valid-hash&type=recovery&next=/auth/reset-password"
      )
    );

    expect(authMocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "valid-hash",
      type: "recovery",
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.pridmora.com/auth/reset-password"
    );
    expect(JSON.parse(String(infoSpy.mock.calls.at(-1)?.[0]))).toMatchObject({
      route: "confirm",
      outcome: "success",
      category: "ok",
    });
  });

  it("rejects missing token hash", async () => {
    const GET = await getConfirm();
    const response = await GET(
      new Request("https://app.pridmora.com/auth/confirm?type=recovery")
    );

    expect(authMocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/auth/error?");
    expect(decodeURIComponent(response.headers.get("location") || "")).toContain(
      "incomplete"
    );
    expect(JSON.parse(String(infoSpy.mock.calls.at(-1)?.[0])).category).toBe(
      "missing_token_hash"
    );
  });

  it("rejects disallowed types", async () => {
    const GET = await getConfirm();
    const response = await GET(
      new Request(
        "https://app.pridmora.com/auth/confirm?token_hash=abc&type=sms"
      )
    );

    expect(authMocks.verifyOtp).not.toHaveBeenCalled();
    expect(decodeURIComponent(response.headers.get("location") || "")).toContain(
      "not valid"
    );
    expect(JSON.parse(String(infoSpy.mock.calls.at(-1)?.[0])).category).toBe(
      "disallowed_type"
    );
  });

  it("maps expired token errors to a safe message", async () => {
    authMocks.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: {
        name: "AuthApiError",
        message: "Email link is invalid or has expired",
        code: "otp_expired",
      },
    });
    const GET = await getConfirm();
    const response = await GET(
      new Request(
        "https://app.pridmora.com/auth/confirm?token_hash=stale&type=recovery"
      )
    );

    expect(decodeURIComponent(response.headers.get("location") || "")).toContain(
      "expired or is no longer valid"
    );
    const log = JSON.parse(String(infoSpy.mock.calls.at(-1)?.[0]));
    expect(log).toMatchObject({
      route: "confirm",
      outcome: "failure",
      errorName: "AuthApiError",
      errorCode: "otp_expired",
      category: "expired_or_invalid",
    });
    expect(JSON.stringify(log)).not.toMatch(/stale|token_hash=|cookie/i);
  });

  it("maps invalid token hash failures safely", async () => {
    authMocks.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: {
        name: "AuthApiError",
        message: "Token has expired or is invalid",
        code: "otp_expired",
      },
    });
    const GET = await getConfirm();
    const response = await GET(
      new Request(
        "https://app.pridmora.com/auth/confirm?token_hash=bad&type=recovery"
      )
    );

    expect(response.headers.get("location")).toContain("/auth/error?");
    expect(decodeURIComponent(response.headers.get("location") || "")).toContain(
      "expired or is no longer valid"
    );
  });

  it("defaults recovery next path and blocks open redirects", async () => {
    authMocks.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    const GET = await getConfirm();

    const defaultNext = await GET(
      new Request(
        "https://app.pridmora.com/auth/confirm?token_hash=valid-hash&type=recovery"
      )
    );
    expect(defaultNext.headers.get("location")).toBe(
      "https://app.pridmora.com/auth/reset-password"
    );

    const openRedirect = await GET(
      new Request(
        "https://app.pridmora.com/auth/confirm?token_hash=valid-hash&type=recovery&next=https://evil.example"
      )
    );
    expect(openRedirect.headers.get("location")).toBe(
      "https://app.pridmora.com/auth/reset-password"
    );
  });
});

describe("auth callback route (PKCE)", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    authMocks.exchangeCodeForSession.mockReset();
    authMocks.verifyOtp.mockReset();
    envMocks.url = "https://example.supabase.co";
    envMocks.anonKey = "test-anon-key";
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.resetModules();
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  async function getCallback() {
    const mod = await import("@/app/auth/callback/route");
    return mod.GET;
  }

  it("still exchanges a PKCE code and redirects to next", async () => {
    authMocks.exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    const GET = await getCallback();

    const response = await GET(
      new Request(
        "https://app.pridmora.com/auth/callback?code=pkce-code&next=/auth/reset-password"
      )
    );

    expect(authMocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(authMocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://app.pridmora.com/auth/reset-password"
    );
    expect(JSON.parse(String(infoSpy.mock.calls.at(-1)?.[0]))).toMatchObject({
      route: "callback",
      outcome: "success",
      category: "ok",
    });
  });

  it("logs PKCE verifier failures without leaking secrets", async () => {
    authMocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: {
        name: "AuthPKCECodeVerifierMissingError",
        message: "PKCE code verifier not found in storage. secret=abc",
        code: "pkce_code_verifier_not_found",
      },
    });
    const GET = await getCallback();
    const response = await GET(
      new Request("https://app.pridmora.com/auth/callback?code=pkce-code")
    );

    expect(response.headers.get("location")).toContain("/auth/error?");
    const log = JSON.parse(String(infoSpy.mock.calls.at(-1)?.[0]));
    expect(log).toMatchObject({
      route: "callback",
      outcome: "failure",
      errorName: "AuthPKCECodeVerifierMissingError",
      errorCode: "pkce_code_verifier_not_found",
      category: "pkce_verifier_missing",
    });
    expect(JSON.stringify(log)).not.toContain("secret=abc");
    expect(JSON.stringify(log)).not.toContain("pkce-code");
  });

  it("rejects open redirects on the PKCE callback", async () => {
    authMocks.exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    const GET = await getCallback();
    const response = await GET(
      new Request(
        "https://app.pridmora.com/auth/callback?code=pkce-code&next=//evil.example"
      )
    );
    expect(response.headers.get("location")).toBe("https://app.pridmora.com/");
  });
});
