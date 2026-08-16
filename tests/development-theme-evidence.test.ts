import { describe, expect, it } from "vitest";
import {
  buildDevelopmentProfileViewModel,
  collectThemeEvidenceItems,
} from "@/lib/development-profile-view-model";
import type {
  DevelopmentProfile,
  DevelopmentUpdate,
} from "@/lib/development-updates/types";
import type { Client } from "@/lib/types";

function makeProfile(
  overrides: Partial<DevelopmentProfile> = {}
): DevelopmentProfile {
  return {
    id: "profile-1",
    clientId: "client-1",
    coachId: "coach-1",
    currentFocus: "",
    strengths: [],
    values: [],
    motivators: [],
    emergingThemes: [
      {
        id: "theme-1",
        value: "Delegation under pressure",
        status: "supported",
        reason: "Named repeatedly in review.",
      },
    ],
    growthAreas: [],
    coachingPreferences: [],
    beliefs: [],
    patterns: [],
    commitments: [],
    coachingPatterns: [],
    patternsEvidenceFingerprint: null,
    patternsGeneratedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function makeUpdate(
  overrides: Partial<DevelopmentUpdate> = {}
): DevelopmentUpdate {
  return {
    id: "update-1",
    clientId: "client-1",
    sessionId: "session-2",
    coachId: "coach-1",
    status: "applied",
    conversationSummary: "Summary",
    proposedChanges: {
      emergingThemes: {
        add: [{ value: "Delegation under pressure", status: "supported" }],
      },
    },
    editedChanges: null,
    appliedChanges: {
      emergingThemes: {
        add: [{ value: "Delegation under pressure", status: "supported" }],
      },
    },
    evidenceSummary: [
      {
        changeKey: "emergingThemes.add.0",
        evidenceText:
          "Alex described handing work earlier when the deadline tightened.",
        sourceExcerpt:
          "I handed the risk review to the team lead before the board pack.",
        sessionId: "session-2",
      },
    ],
    hasMeaningfulChanges: true,
    coachNote: "",
    generatedAt: null,
    reviewedAt: null,
    appliedAt: "2026-08-01T00:00:00.000Z",
    discardedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("Development theme evidence visibility", () => {
  it("collects existing applied-update evidence for a matching theme", () => {
    const theme = makeProfile().emergingThemes[0];
    const items = collectThemeEvidenceItems(
      theme,
      [makeUpdate()],
      [
        {
          id: "session-2",
          sessionNumber: 2,
        } as Client["sessions"][number],
      ]
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.sourceLabel).toBe("Approved development update");
    expect(items[0]?.sessionLabel).toBe("Session 2");
    expect(items[0]?.content).toBe(
      "I handed the risk review to the team lead before the board pack."
    );
  });

  it("falls back to the profile theme reason when no update evidence exists", () => {
    const theme = makeProfile().emergingThemes[0];
    const items = collectThemeEvidenceItems(theme, [], []);
    expect(items).toHaveLength(1);
    expect(items[0]?.sourceLabel).toBe("Approved development record");
    expect(items[0]?.content).toBe("Named repeatedly in review.");
  });

  it("attaches evidence items on the development profile view model", () => {
    const client = {
      id: "client-1",
      name: "Alex Morgan",
      sessions: [{ id: "session-2", sessionNumber: 2 }],
      actions: [],
    } as unknown as Client;

    const viewModel = buildDevelopmentProfileViewModel(
      client,
      makeProfile(),
      [makeUpdate()]
    );

    const theme = viewModel.themes[0];
    expect(theme?.evidenceCount).toBe(1);
    expect(theme?.evidenceItems?.[0]?.sessionLabel).toBe("Session 2");
    expect(theme?.evidenceItems?.[0]?.content).toContain("risk review");
  });

  it("does not invent evidence for unrelated themes", () => {
    const theme = {
      id: "theme-other",
      value: "Unrelated theme",
      status: "emerging" as const,
    };
    const items = collectThemeEvidenceItems(theme, [makeUpdate()], []);
    expect(items).toEqual([]);
  });
});
