import { afterEach, describe, expect, it, vi } from "vitest";

const apiJson = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiJson: (...args: unknown[]) => apiJson(...args),
  AuthRequiredError: class AuthRequiredError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = "AuthRequiredError";
    }
  },
}));

vi.mock("@/lib/errors", async () => {
  const actual = await vi.importActual<typeof import("@/lib/errors")>(
    "@/lib/errors"
  );
  return actual;
});

import { ApiRequestError } from "@/lib/api-failure";
import { loadSessionsForClient } from "@/lib/storage";

afterEach(() => {
  apiJson.mockReset();
});

const relationshipId = "f6e1583d-91b4-4166-b63a-0292da1a75f1";

describe("loadSessionsForClient", () => {
  it("loads sessions for a valid relationship", async () => {
    apiJson.mockResolvedValueOnce({
      sessions: [
        {
          id: "s1",
          clientId: relationshipId,
          sessionNumber: 1,
          summary: "",
        },
      ],
    });

    const sessions = await loadSessionsForClient(relationshipId);
    expect(sessions).toHaveLength(1);
    expect(apiJson).toHaveBeenCalledWith(
      `/api/sessions?clientId=${encodeURIComponent(relationshipId)}`,
      expect.objectContaining({
        method: "GET",
        operation: "load_relationship_sessions",
        relationshipId,
      })
    );
  });

  it("supports a relationship with several sessions", async () => {
    apiJson.mockResolvedValueOnce({
      sessions: [
        { id: "s2", sessionNumber: 2 },
        { id: "s1", sessionNumber: 1 },
      ],
    });

    const sessions = await loadSessionsForClient(relationshipId);
    expect(sessions).toHaveLength(2);
  });

  it("supports a relationship with one session", async () => {
    apiJson.mockResolvedValueOnce({
      sessions: [{ id: "s1", sessionNumber: 1 }],
    });

    await expect(loadSessionsForClient(relationshipId)).resolves.toHaveLength(1);
  });

  it("rejects an invalid relationship ID before calling the API", async () => {
    await expect(loadSessionsForClient("not-a-uuid")).rejects.toThrow(
      /valid client/i
    );
    expect(apiJson).not.toHaveBeenCalled();
  });

  it("surfaces unauthorised relationship failures", async () => {
    apiJson.mockRejectedValueOnce(
      new ApiRequestError({
        message: "Not found.",
        status: 404,
        responseBody: { error: "Not found." },
      })
    );

    await expect(loadSessionsForClient(relationshipId)).rejects.toThrow(/not found/i);
  });

  it("surfaces archived relationship conflicts", async () => {
    apiJson.mockRejectedValueOnce(
      new ApiRequestError({
        message: "This client is archived.",
        status: 409,
        responseBody: { error: "This client is archived." },
      })
    );

    await expect(loadSessionsForClient(relationshipId)).rejects.toThrow(/archived/i);
  });

  it("surfaces network failures without looping", async () => {
    apiJson.mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(loadSessionsForClient(relationshipId)).rejects.toThrow(
      /failed to fetch/i
    );
    expect(apiJson).toHaveBeenCalledTimes(1);
  });

  it("surfaces 500 JSON body failures", async () => {
    apiJson.mockRejectedValueOnce(
      new ApiRequestError({
        message: "Unable to load relationship sessions.",
        status: 500,
        responseBody: { error: "Unable to load relationship sessions." },
      })
    );

    await expect(loadSessionsForClient(relationshipId)).rejects.toThrow(
      /unable to load relationship sessions/i
    );
  });

  it("surfaces 500 text body failures", async () => {
    apiJson.mockRejectedValueOnce(
      new ApiRequestError({
        message: "The server encountered an error. Please try again.",
        status: 500,
        responseBody: "Internal Server Error",
      })
    );

    await expect(loadSessionsForClient(relationshipId)).rejects.toThrow(
      /server encountered an error/i
    );
  });

  it("surfaces malformed response failures", async () => {
    apiJson.mockRejectedValueOnce(
      new ApiRequestError({
        message: "The server returned an unexpected response.",
        status: 200,
        responseBody: "<html>broken</html>",
      })
    );

    await expect(loadSessionsForClient(relationshipId)).rejects.toThrow(
      /unexpected response/i
    );
  });

  it("returns an empty list when the API omits sessions", async () => {
    apiJson.mockResolvedValueOnce({});
    await expect(loadSessionsForClient(relationshipId)).resolves.toEqual([]);
  });
});

describe("patterns generate query correction", () => {
  it("does not order sessions by a non-existent date column", async () => {
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile(
        new URL("../app/api/patterns/generate/route.ts", import.meta.url),
        "utf8"
      )
    );
    expect(source).not.toMatch(/\.order\(\s*["']date["']/);
    expect(source).toMatch(/\.order\(\s*["']session_number["']/);
    expect(source).toMatch(/\.order\(\s*["']session_date["']/);
  });
});
