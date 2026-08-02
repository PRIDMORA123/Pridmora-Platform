import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  logApiFailure,
  readSafeResponseBody,
} from "@/lib/api-failure";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logApiFailure", () => {
  it("logs structured fields instead of an empty object", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logApiFailure({
      operation: "load_relationship_sessions",
      method: "GET",
      url: "/api/sessions?clientId=abc",
      status: 500,
      statusText: "Internal Server Error",
      message: "Unable to load relationship sessions.",
      responseBody: { error: "Unable to load relationship sessions." },
      relationshipId: "f6e1583d-91b4-4166-b63a-0292da1a75f1",
      requestId: "req-1",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [, details] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(spy.mock.calls[0]?.[0]).toBe("[API] Request failed");
    expect(details.operation).toBe("load_relationship_sessions");
    expect(details.status).toBe(500);
    expect(details.relationshipId).toBe(
      "f6e1583d-91b4-4166-b63a-0292da1a75f1"
    );
    expect(details.responseBody).toEqual({
      error: "Unable to load relationship sessions.",
    });
    expect(Object.keys(details).length).toBeGreaterThan(3);
  });

  it("does not include sensitive note content in logged bodies", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logApiFailure({
      operation: "save_session",
      method: "PUT",
      status: 500,
      responseBody: {
        error: "Failed",
        notes: "Private client narrative must never appear",
        private_notes: "Coach private note",
        token: "secret-token",
      },
      relationshipId: "rel-1",
    });

    const details = spy.mock.calls[0]?.[1] as {
      responseBody: Record<string, unknown>;
    };
    expect(details.responseBody.notes).toBe("[redacted]");
    expect(details.responseBody.private_notes).toBe("[redacted]");
    expect(details.responseBody.token).toBe("[redacted]");
    expect(details.responseBody.error).toBe("Failed");
  });
});

describe("readSafeResponseBody", () => {
  it("reads JSON error bodies once", async () => {
    const response = new Response(
      JSON.stringify({ error: "Unable to load relationship sessions." }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );

    await expect(readSafeResponseBody(response)).resolves.toEqual({
      error: "Unable to load relationship sessions.",
    });
  });

  it("reads text error bodies safely", async () => {
    const response = new Response("Internal failure detail", {
      status: 500,
      headers: { "content-type": "text/plain" },
    });

    await expect(readSafeResponseBody(response)).resolves.toBe(
      "Internal failure detail"
    );
  });
});

describe("ApiRequestError", () => {
  it("carries status and response body for callers", () => {
    const error = new ApiRequestError({
      message: "Unable to load relationship sessions.",
      status: 500,
      responseBody: { error: "Unable to load relationship sessions." },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(500);
    expect(error.responseBody).toEqual({
      error: "Unable to load relationship sessions.",
    });
  });
});
