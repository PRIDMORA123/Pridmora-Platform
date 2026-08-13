import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createBrowserClient = vi.hoisted(() =>
  vi.fn(() => ({
    auth: {
      resetPasswordForEmail: vi.fn(),
    },
  }))
);

vi.mock("@supabase/ssr", () => ({
  createBrowserClient,
}));

describe("browser Supabase API URL", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    createBrowserClient.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }
    if (originalKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    }
  });

  it("uses the configured Supabase host and never platform.pridmora.com for Auth", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://lxfdhnwjmtfbawznivbu.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const { getSupabaseUrl, isSupabaseProjectApiUrl } = await import(
      "@/lib/supabase/env"
    );
    const { createBrowserSupabaseClient } = await import(
      "@/lib/supabase/browser"
    );

    expect(
      isSupabaseProjectApiUrl("https://platform.pridmora.com")
    ).toBe(false);
    expect(getSupabaseUrl()).toBe(
      "https://lxfdhnwjmtfbawznivbu.supabase.co"
    );

    createBrowserSupabaseClient();

    expect(createBrowserClient).toHaveBeenCalledTimes(1);
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://lxfdhnwjmtfbawznivbu.supabase.co",
      "test-anon-key"
    );
    const firstCall = createBrowserClient.mock.calls.at(0) as
      | [string, string]
      | undefined;
    const supabaseUrl = firstCall?.[0] ?? "";
    expect(supabaseUrl).not.toContain("platform.pridmora.com");
    expect(new URL(supabaseUrl).hostname).toBe(
      "lxfdhnwjmtfbawznivbu.supabase.co"
    );
    expect(`${supabaseUrl}/auth/v1/recover`).toBe(
      "https://lxfdhnwjmtfbawznivbu.supabase.co/auth/v1/recover"
    );
  });

  it("rejects the Pridmora app origin when misconfigured as NEXT_PUBLIC_SUPABASE_URL", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://platform.pridmora.com";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const { getSupabaseUrl } = await import("@/lib/supabase/env");
    const { createBrowserSupabaseClient } = await import(
      "@/lib/supabase/browser"
    );

    expect(getSupabaseUrl()).toBeUndefined();
    expect(() => createBrowserSupabaseClient()).toThrow(
      /must be a Supabase project URL/i
    );
    expect(createBrowserClient).not.toHaveBeenCalled();
  });
});
