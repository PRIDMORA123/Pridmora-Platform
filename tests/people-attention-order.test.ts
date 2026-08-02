import { describe, expect, it } from "vitest";
import {
  getPeopleAttentionRank,
  getPeopleNextActionLabel,
  sortClientsByAttention,
} from "@/lib/people/attention-order";
import { getConciseDevelopmentFocus } from "@/lib/people/development-focus-display";
import { createBlankSession } from "@/lib/sessions";
import type { Client, Session } from "@/lib/types";

function makeSession(
  overrides: Partial<Session> & { sessionNumber?: number } = {}
): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: overrides.clientId ?? "client-1",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status ?? "planned",
    }),
    ...overrides,
  };
}

function makeClient(
  overrides: Partial<Client> & { sessions?: Session[] } = {}
): Client {
  return {
    id: overrides.id ?? "client-1",
    name: overrides.name ?? "Alex Example",
    initials: "AE",
    organisation: "Example Org",
    role: "Manager",
    email: "",
    status: overrides.status ?? "Active",
    createdAt: "2026-01-01T00:00:00.000Z",
    nextSession: "",
    currentFocus: overrides.currentFocus ?? "Build confidence in delegation",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: overrides.sessions ?? [],
    journey: [],
    ...overrides,
  };
}

describe("getPeopleAttentionRank", () => {
  it("ranks active conversation first", () => {
    const client = makeClient({
      sessions: [makeSession({ status: "in_progress" })],
    });
    expect(getPeopleAttentionRank(client)).toBe(1);
  });

  it("ranks notes awaiting completion second", () => {
    const client = makeClient({
      sessions: [makeSession({ status: "awaiting_completion" })],
    });
    expect(getPeopleAttentionRank(client)).toBe(2);
  });

  it("ranks Summary & Insights awaiting review third", () => {
    const client = makeClient({
      sessions: [
        makeSession({
          status: "awaiting_completion",
          reflectWhatSurprised: "A clear shift in ownership.",
          commitments: "Ask supervisors first.",
          summaryStatus: "draft",
          summary: "Draft summary ready for review.",
        }),
      ],
    });
    expect(getPeopleAttentionRank(client)).toBe(3);
    expect(getPeopleNextActionLabel(client)).toBe("Review Summary & Insights");
  });

  it("ranks preparation ready fourth", () => {
    const client = makeClient({
      sessions: [makeSession({ status: "prepared" })],
    });
    expect(getPeopleAttentionRank(client)).toBe(4);
  });

  it("ranks unplanned next conversation fifth", () => {
    const client = makeClient({ sessions: [] });
    expect(getPeopleAttentionRank(client)).toBe(5);
    expect(getPeopleNextActionLabel(client)).toBe("Open relationship");
  });

  it("ranks quieter planned preparation as no recent activity", () => {
    const client = makeClient({
      sessions: [makeSession({ status: "planned" })],
    });
    expect(getPeopleAttentionRank(client)).toBe(6);
    expect(getPeopleNextActionLabel(client)).toBe("Prepare conversation");
  });
});

describe("sortClientsByAttention", () => {
  it("orders active relationships by persisted attention state", () => {
    const planned = makeClient({
      id: "c-planned",
      name: "Zoe Planned",
      sessions: [makeSession({ clientId: "c-planned", status: "planned" })],
    });
    const active = makeClient({
      id: "c-active",
      name: "Mia Active",
      sessions: [makeSession({ clientId: "c-active", status: "in_progress" })],
    });
    const unplanned = makeClient({
      id: "c-unplanned",
      name: "Noah Unplanned",
      sessions: [],
    });
    const prepared = makeClient({
      id: "c-prepared",
      name: "Owen Prepared",
      sessions: [makeSession({ clientId: "c-prepared", status: "prepared" })],
    });

    const ordered = sortClientsByAttention([
      planned,
      unplanned,
      prepared,
      active,
    ]);

    expect(ordered.map(client => client.id)).toEqual([
      "c-active",
      "c-prepared",
      "c-unplanned",
      "c-planned",
    ]);
  });
});

describe("getConciseDevelopmentFocus", () => {
  it("shortens on a complete word boundary", () => {
    const long =
      "building capability and accountability in operational leadership across the wider service";
    const result = getConciseDevelopmentFocus(long, 40);
    expect(result.length).toBeLessThanOrEqual(41);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toMatch(/i…$/);
    expect(result.toLowerCase()).not.toContain("accountabili…");
  });

  it("keeps short focus text intact", () => {
    expect(getConciseDevelopmentFocus("Build confidence in delegation")).toBe(
      "Build confidence in delegation"
    );
  });
});
