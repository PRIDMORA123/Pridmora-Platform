import { describe, expect, it } from "vitest";
import {
  refineDevelopmentUpdateGeneration,
  stripBracketedEvidenceStatusMarkers,
} from "@/lib/development-updates/evidence-status";
import { buildChangeDisplayItems } from "@/lib/development-updates/presentation";
import type { DevelopmentProfile } from "@/lib/development-updates/types";

describe("stripBracketedEvidenceStatusMarkers", () => {
  it("removes bracketed evidence status text from prose", () => {
    expect(
      stripBracketedEvidenceStatusMarkers(
        "Alex is acting earlier on project judgement [supported] when prepared."
      )
    ).toBe("Alex is acting earlier on project judgement when prepared.");
    expect(
      stripBracketedEvidenceStatusMarkers(
        "Confidence remains mixed [emerging]."
      )
    ).toBe("Confidence remains mixed.");
    expect(
      stripBracketedEvidenceStatusMarkers(
        "This pattern is now [well_established] in day-to-day work."
      )
    ).toBe("This pattern is now in day-to-day work.");
    expect(
      stripBracketedEvidenceStatusMarkers(
        "Also handles [well-established] and [well established] forms."
      )
    ).toBe("Also handles and forms.");
  });
});

describe("Development Update display strips status markers", () => {
  it("does not show bracketed status markers in change body", () => {
    const items = buildChangeDisplayItems({
      strengths: {
        add: [
          {
            value: "Acts earlier on sound project judgement [supported]",
            status: "supported",
            reason: "Repeated examples",
          },
        ],
      },
    });
    expect(items[0].body).toBe("Acts earlier on sound project judgement");
    expect(items[0].body).not.toMatch(/\[supported\]/i);
    expect(items[0].statusLabel).toBe("Supported");
  });
});

describe("refineDevelopmentUpdateGeneration status semantics", () => {
  it("keeps indirect belief evidence emerging", () => {
    const refined = refineDevelopmentUpdateGeneration(
      {
        conversationSummary: "Explored confidence with senior colleagues.",
        hasMeaningfulChanges: true,
        proposedChanges: {
          beliefs: {
            add: [
              {
                value:
                  "Alex may believe their view is less valid when seniors are present.",
                status: "supported",
                reason:
                  "This appears to be implied by them waiting for senior colleagues to speak first.",
              },
            ],
          },
        },
        evidence: [],
      },
      null
    );
    expect(refined.proposedChanges.beliefs?.add?.[0]?.status).toBe("emerging");
  });

  it("marks repeated behavioural evidence as supported", () => {
    const refined = refineDevelopmentUpdateGeneration(
      {
        conversationSummary: "Reviewed further project examples.",
        hasMeaningfulChanges: true,
        proposedChanges: {
          strengths: {
            add: [
              {
                value:
                  "States a clear recommendation when prepared with project evidence.",
                status: "supported",
                reason:
                  "Again demonstrated in a second project meeting, and a further example was reviewed this session.",
              },
            ],
          },
        },
        evidence: [],
      },
      null
    );
    expect(refined.proposedChanges.strengths?.add?.[0]?.status).toBe("supported");
  });

  it("does not treat single-occasion evidence as supported by default", () => {
    const refined = refineDevelopmentUpdateGeneration(
      {
        conversationSummary: "One project example was discussed.",
        hasMeaningfulChanges: true,
        proposedChanges: {
          patterns: {
            add: [
              {
                value: "Hesitates when senior colleagues are present.",
                status: "supported",
                reason: "Mentioned once in this conversation.",
              },
            ],
          },
        },
        evidence: [],
      },
      null
    );
    expect(refined.proposedChanges.patterns?.add?.[0]?.status).toBe("emerging");
  });

  it("does not downgrade well_established without contradictory evidence", () => {
    const profile = {
      id: "profile-1",
      clientId: "client-1",
      coachId: "coach-1",
      currentFocus: "Recommendation clarity",
      strengths: [
        {
          id: "s1",
          value: "Acts on sound project judgement.",
          status: "well_established",
        },
      ],
      values: [],
      motivators: [],
      emergingThemes: [],
      growthAreas: [],
      coachingPreferences: [],
      beliefs: [],
      patterns: [],
      commitments: [],
      coachingPatterns: [],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    } as unknown as DevelopmentProfile;

    const refined = refineDevelopmentUpdateGeneration(
      {
        conversationSummary: "Continued progress.",
        hasMeaningfulChanges: true,
        proposedChanges: {
          strengths: {
            update: [
              {
                id: "s1",
                value: "Acts on sound project judgement in project discussions.",
                status: "emerging",
                reason: "Still visible in this conversation.",
              },
            ],
          },
        },
        evidence: [],
      },
      profile
    );
    expect(refined.proposedChanges.strengths?.update?.[0]?.status).toBe(
      "well_established"
    );
  });

  it("allows downgrade of well_established when contradiction is explicit", () => {
    const profile = {
      strengths: [
        {
          id: "s1",
          value: "Acts on sound project judgement.",
          status: "well_established",
        },
      ],
    } as unknown as DevelopmentProfile;

    const refined = refineDevelopmentUpdateGeneration(
      {
        conversationSummary: "Evidence changed.",
        hasMeaningfulChanges: true,
        proposedChanges: {
          strengths: {
            update: [
              {
                id: "s1",
                value: "Project judgement is less consistent than previously thought.",
                status: "emerging",
                reason: "This session contradicts earlier evidence of consistent action.",
              },
            ],
          },
        },
        evidence: [],
      },
      profile
    );
    expect(refined.proposedChanges.strengths?.update?.[0]?.status).toBe("emerging");
  });
});
