import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractSafeOpenAiErrorMetadata,
  isOpenAiProviderError,
  isPreparationRelationshipAccessError,
  sanitiseProviderErrorMessage,
} from "@/lib/coaching-intelligence/safe-openai-error";

describe("safe OpenAI error metadata", () => {
  it("extracts status, code, type and safe short message", () => {
    const meta = extractSafeOpenAiErrorMetadata({
      status: 401,
      code: "invalid_api_key",
      type: "invalid_request_error",
      message: "Incorrect API key provided",
    });
    expect(meta).toEqual({
      status: 401,
      code: "invalid_api_key",
      type: "invalid_request_error",
      message: "Incorrect API key provided",
    });
  });

  it("reads nested OpenAI error body fields", () => {
    const meta = extractSafeOpenAiErrorMetadata({
      status: 403,
      message: "Permission denied",
      error: {
        code: "model_not_found",
        type: "invalid_request_error",
        message: "You do not have access to model gpt-5.5",
      },
    });
    expect(meta.status).toBe(403);
    expect(meta.code).toBe("model_not_found");
    expect(meta.type).toBe("invalid_request_error");
    expect(meta.message).toBe("Permission denied");
  });

  it("extracts 429 quota metadata", () => {
    const meta = extractSafeOpenAiErrorMetadata({
      status: 429,
      code: "rate_limit_exceeded",
      type: "tokens",
      message: "Rate limit exceeded",
    });
    expect(meta.status).toBe(429);
    expect(meta.code).toBe("rate_limit_exceeded");
    expect(meta.type).toBe("tokens");
    expect(meta.message).toBe("Rate limit exceeded");
  });

  it("drops unsafe messages that look like prompts, keys, or identifiers", () => {
    expect(
      sanitiseProviderErrorMessage("Person context: Alex Morgan Project Coordinator")
    ).toBeNull();
    expect(
      sanitiseProviderErrorMessage("Bearer sk-proj-abcdefghijklmnopqrstuvwxyz")
    ).toBeNull();
    expect(
      sanitiseProviderErrorMessage(
        "Failed for relationshipId 11111111-1111-4111-8111-111111111111"
      )
    ).toBeNull();
    expect(
      sanitiseProviderErrorMessage(
        `{"topicsToExplore":["delegation"],"suggestedQuestions":["q"]}`
      )
    ).toBeNull();
  });

  it("recognises OpenAI provider errors and ownership errors", () => {
    expect(
      isOpenAiProviderError({
        name: "AuthenticationError",
        status: 401,
        code: "invalid_api_key",
      })
    ).toBe(true);
    expect(isOpenAiProviderError(new Error("random boom"))).toBe(false);
    expect(
      isPreparationRelationshipAccessError(new Error("RELATIONSHIP_NOT_FOUND"))
    ).toBe(true);
  });
});

describe("prepare route OpenAI diagnostics", () => {
  const RELATIONSHIP_ID = "11111111-1111-4111-8111-111111111111";
  const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";
  const COACH_ID = "33333333-3333-4333-8333-333333333333";

  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
    vi.restoreAllMocks();
  });

  function mockAccessOk() {
    const update = vi.fn(async () => ({ error: null }));
    const maybeSingleClient = vi.fn(async () => ({
      data: {
        id: RELATIONSHIP_ID,
        name: "Alex Morgan",
        organisation: "Customer One",
        role: "Project Coordinator",
        current_focus: null,
        updated_at: "2026-08-14T00:00:00.000Z",
        identity_mode: "standard",
        display_label: "Alex Morgan",
        confidential_reference: null,
        ai_name_allowed: true,
      },
      error: null,
    }));
    const maybeSingleSession = vi.fn(async () => ({
      data: {
        id: CONVERSATION_ID,
        client_id: RELATIONSHIP_ID,
        coach_id: COACH_ID,
        prep_private_notes: null,
      },
      error: null,
    }));
    const otherClients = vi.fn(async () => ({ data: [], error: null }));

    let sessionsSelectCount = 0;
    const from = vi.fn((table: string) => {
      if (table === "clients") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function eqChain() {
              const chain: Record<string, unknown> = {
                eq: vi.fn(() => chain),
                neq: vi.fn(() => ({
                  then: undefined,
                })),
                maybeSingle: maybeSingleClient,
              };
              // Second clients query is knownOtherNames (.select().eq().neq())
              chain.neq = vi.fn(async () => {
                const result = await otherClients();
                return result;
              });
              return chain;
            }),
          })),
        };
      }
      if (table === "sessions") {
        sessionsSelectCount += 1;
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function eqChain() {
              const chain: Record<string, unknown> = {
                eq: vi.fn(() => chain),
                maybeSingle: maybeSingleSession,
                order: vi.fn(async () => ({ data: [], error: null })),
              };
              return chain;
            }),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: update,
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [], error: null })),
        })),
      };
    });

    vi.doMock("@/lib/organisations/person-access-gate", () => ({
      requireAssignedPersonInOrganisation: vi.fn(async () => ({
        ok: true,
        context: {
          supabase: { from },
          coachId: COACH_ID,
          user: { id: COACH_ID },
          organisation: {
            organisationId: "44444444-4444-4444-8444-444444444444",
            organisation: { aiEnabled: true },
          },
        },
        clientId: RELATIONSHIP_ID,
        assignment: { assignmentRole: "primary" },
        privateNotesOwnerId: COACH_ID,
        clientOrganisationId: "44444444-4444-4444-8444-444444444444",
        clientCoachId: COACH_ID,
      })),
    }));

    vi.doMock("@/lib/coaching-intelligence/resolve-sources", () => ({
      resolveIntelligenceSources: vi.fn(async () => ({
        previousConversations: [],
        approvedSummaries: [],
        openCommitments: [],
        approvedReflections: [],
        journeyEvidence: [],
        developmentThemes: [],
        approvedReports: [],
        usedSources: [],
      })),
    }));

    vi.doMock("@/lib/relationship-scope", async () => {
      const actual = await vi.importActual<
        typeof import("@/lib/relationship-scope")
      >("@/lib/relationship-scope");
      return {
        ...actual,
        assertRelationshipOwnership: vi.fn(),
        logRelationshipIsolationRejection: vi.fn(),
      };
    });

    return { update, sessionsSelectCount };
  }

  async function postPrepare() {
    const { POST } = await import(
      "@/app/api/coaching-intelligence/prepare/route"
    );
    return POST(
      new Request("http://localhost/api/coaching-intelligence/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationshipId: RELATIONSHIP_ID,
          conversationId: CONVERSATION_ID,
          mode: "assisted",
        }),
      })
    );
  }

  it("missing key remains PREPARATION_AI_UNAVAILABLE", async () => {
    delete process.env.OPENAI_API_KEY;
    mockAccessOk();
    const create = vi.fn();
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const response = await postPrepare();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.errorCode).toBe("PREPARATION_AI_UNAVAILABLE");
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "401 invalid key",
      error: {
        name: "AuthenticationError",
        status: 401,
        code: "invalid_api_key",
        type: "invalid_request_error",
        message: "Incorrect API key provided",
      },
    },
    {
      label: "403 model access",
      error: {
        name: "PermissionDeniedError",
        status: 403,
        code: "model_not_found",
        type: "invalid_request_error",
        message: "You do not have access to this model",
      },
    },
    {
      label: "429 quota",
      error: {
        name: "RateLimitError",
        status: 429,
        code: "rate_limit_exceeded",
        type: "tokens",
        message: "Rate limit exceeded",
      },
    },
    {
      label: "5xx provider",
      error: {
        name: "InternalServerError",
        status: 500,
        code: "server_error",
        type: "server_error",
        message: "The server had an error",
      },
    },
  ])(
    "mocked $label logs safe metadata only and keeps client response",
    async ({ error }) => {
      process.env.OPENAI_API_KEY = "test-key-present";
      mockAccessOk();
      const create = vi.fn(async () => {
        throw error;
      });
      vi.doMock("openai", () => ({
        default: class {
          responses = { create };
        },
      }));

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await postPrepare();
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body.errorCode).toBe("PREPARATION_AI_REQUEST_FAILED");
      expect(body.error).toBe(
        "Preparation could not be refreshed. Your existing preparation remains available. Please try again."
      );

      const diagnostic = consoleError.mock.calls
        .map(args => args[0] === "[preparation-refresh]" && args[1])
        .find(
          payload =>
            payload &&
            typeof payload === "object" &&
            (payload as { errorCode?: string }).errorCode ===
              "PREPARATION_AI_REQUEST_FAILED"
        ) as
        | {
            errorCode: string;
            status: number | null;
            code: string | null;
            type: string | null;
            message: string | null;
          }
        | undefined;

      expect(diagnostic).toBeTruthy();
      expect(diagnostic?.status).toBe(error.status);
      expect(diagnostic?.code).toBe(error.code);
      expect(diagnostic?.type).toBe(error.type);
      expect(diagnostic?.message).toBe(error.message);

      const serialised = JSON.stringify(consoleError.mock.calls);
      expect(serialised).not.toContain("Alex Morgan");
      expect(serialised).not.toContain(RELATIONSHIP_ID);
      expect(serialised).not.toContain(CONVERSATION_ID);
      expect(serialised).not.toContain("Person context");
      expect(serialised).not.toContain("test-key-present");
      expect(serialised.toLowerCase()).not.toContain("instructions");
    }
  );

  it("network-style provider failure remains PREPARATION_AI_REQUEST_FAILED", async () => {
    process.env.OPENAI_API_KEY = "test-key-present";
    mockAccessOk();
    const create = vi.fn(async () => {
      const error = new Error("Connection error.");
      error.name = "APIConnectionError";
      throw error;
    });
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await postPrepare();
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.errorCode).toBe("PREPARATION_AI_REQUEST_FAILED");

    const diagnostic = consoleError.mock.calls
      .map(args => args[1])
      .find(
        payload =>
          payload &&
          typeof payload === "object" &&
          (payload as { errorCode?: string }).errorCode ===
            "PREPARATION_AI_REQUEST_FAILED"
      );
    expect(diagnostic).toBeTruthy();
  });
});
