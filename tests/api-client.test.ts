import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/browser", () => ({
  requireBrowserAuth: vi.fn(async () => undefined),
}));

import {
  apiJson,
  fallbackMessageForHttpStatus,
  isNetworkFetchError,
  NETWORK_ERROR_MESSAGE,
} from "@/lib/api-client";
import { ApiRequestError } from "@/lib/api-failure";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isNetworkFetchError", () => {
  it("detects browser connectivity failures", () => {
    expect(isNetworkFetchError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFetchError(new Error("fetch failed"))).toBe(true);
    expect(isNetworkFetchError(new Error("NetworkError when attempting to fetch resource."))).toBe(
      true
    );
  });

  it("does not treat application errors as network failures", () => {
    expect(isNetworkFetchError(new Error("Unable to load the development profile."))).toBe(
      false
    );
    expect(
      isNetworkFetchError(
        new ApiRequestError({
          message: "The server encountered an error. Please try again.",
          status: 500,
        })
      )
    ).toBe(false);
  });
});

describe("fallbackMessageForHttpStatus", () => {
  it("never uses the network-unreachable copy for HTTP failures", () => {
    expect(fallbackMessageForHttpStatus(500)).not.toMatch(/unable to reach the server/i);
    expect(fallbackMessageForHttpStatus(500)).toMatch(/server encountered an error/i);
    expect(fallbackMessageForHttpStatus(404)).toMatch(/not found/i);
  });
});

describe("apiJson", () => {
  it("surfaces application HTTP errors instead of a network message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "content-type": "text/plain" },
        })
      )
    );

    await expect(apiJson("/api/development-profiles/abc")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 500,
      message: "Internal Server Error",
    });
  });

  it("uses JSON error bodies from the API when present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Unable to load the development profile." }), {
          status: 500,
          headers: { "content-type": "application/json" },
        })
      )
    );

    await expect(apiJson("/api/development-profiles/abc")).rejects.toThrow(
      /unable to load the development profile/i
    );
  });

  it("uses the network message only when fetch cannot connect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    await expect(apiJson("/api/development-profiles/abc")).rejects.toMatchObject({
      name: "ApiRequestError",
      message: NETWORK_ERROR_MESSAGE,
    });
  });
});
