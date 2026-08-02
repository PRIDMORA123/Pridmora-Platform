import { describe, expect, it } from "vitest";
import { createBlankSession } from "@/lib/sessions";
import {
  buildCurrentPositionPanelModel,
  createConciseFocus,
  getCurrentFocusDisplay,
  getCurrentPositionDisplay,
  getLatestApprovedSessionCommitments,
  getLatestApprovedSessionEvidence,
  getOutstandingCommitmentDisplay,
  isMeaningfullyDuplicateText,
  normaliseDisplayText,
} from "@/lib/relationship-workspace/current-position-display";
import type { Session } from "@/lib/types";

const SARAH_PURPOSE =
  "To build confidence and capability as a new operational leader by strengthening delegation, accountability, strategic thinking and leadership presence.";

const SARAH_APPROVED_SUMMARY =
  "Sarah reflected on an experience of stepping back from an operational issue and recognised that quality was maintained while her supervisor had space to demonstrate capability. She described feeling proud of the outcome and noticed discomfort at not being directly involved. The session also explored her awareness of wanting to improve confidence, presence and team leadership.";

const SARAH_IDENTITY =
  "Sarah is moving from direct operational problem-solving towards leading through others. She is beginning to delegate more consistently but still finds it difficult to step back when standards feel at risk.";

function makeSession(
  overrides: Partial<Session> & { sessionNumber?: number } = {}
): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: "client-sarah",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status ?? "awaiting_completion",
    }),
    ...overrides,
  };
}

describe("getCurrentPositionDisplay", () => {
  it("uses an approved current-position field when available", () => {
    const result = getCurrentPositionDisplay({
      approvedCurrentPosition: SARAH_IDENTITY,
      coachingPurpose: SARAH_PURPOSE,
      clientName: "Sarah Thompson",
    });

    expect(result).toContain("moving from direct operational problem-solving");
    expect(result).not.toEqual(SARAH_PURPOSE);
  });

  it("falls back to approved development direction", () => {
    const result = getCurrentPositionDisplay({
      approvedDevelopmentDirection:
        "Sarah is practising leading through others rather than solving every issue herself.",
      coachingPurpose: SARAH_PURPOSE,
      clientName: "Sarah Thompson",
    });

    expect(result).toContain("practising leading through others");
  });

  it("falls back to coaching purpose only as a first-session template", () => {
    const result = getCurrentPositionDisplay({
      coachingPurpose: SARAH_PURPOSE,
      clientName: "Sarah Thompson",
    });

    expect(result).toContain("Sarah is beginning this coaching relationship");
    expect(result).toContain("developing confidence and capability");
    expect(result).not.toBe(SARAH_PURPOSE);
  });

  it("uses approved session evidence before coaching purpose", () => {
    const result = getCurrentPositionDisplay({
      approvedSessionEvidence: SARAH_APPROVED_SUMMARY,
      coachingPurpose: SARAH_PURPOSE,
      clientName: "Sarah Thompson",
    });

    expect(result).toContain("stepping back from an operational issue");
    expect(result).not.toContain("beginning this coaching relationship");
    expect(result.length).toBeLessThanOrEqual(300);
  });

  it("ignores journey placeholder development direction in favour of session evidence", () => {
    const result = getCurrentPositionDisplay({
      approvedDevelopmentDirection: "The development story is still forming",
      approvedSessionEvidence: SARAH_APPROVED_SUMMARY,
      coachingPurpose: SARAH_PURPOSE,
      clientName: "Sarah Thompson",
    });

    expect(result).toContain("stepping back from an operational issue");
    expect(result).not.toContain("development story is still forming");
  });

  it("returns an honest empty state", () => {
    expect(
      getCurrentPositionDisplay({
        clientName: "Sarah Thompson",
      })
    ).toBe("No current-position summary has been recorded yet.");
  });

  it("clips a long current-position narrative without silent meaning loss markers beyond ellipsis", () => {
    const long = `${"Evidence of progress appears in several settings. ".repeat(12)}Final sentence remains.`;
    const result = getCurrentPositionDisplay({
      approvedCurrentPosition: long,
      clientName: "Sarah Thompson",
    });

    expect(result.length).toBeLessThanOrEqual(281);
    expect(result.startsWith("Evidence of progress")).toBe(true);
  });
});

describe("getCurrentFocusDisplay", () => {
  it("uses explicit current focus", () => {
    expect(
      getCurrentFocusDisplay({
        currentFocus:
          "Build confidence in delegation, accountability and strategic leadership.",
        coachingPurpose: SARAH_PURPOSE,
      })
    ).toBe(
      "Build confidence in delegation, accountability and strategic leadership"
    );
  });

  it("falls back to approved next-focus", () => {
    expect(
      getCurrentFocusDisplay({
        approvedNextFocus: "Explore standards versus ownership.",
        coachingPurpose: SARAH_PURPOSE,
      })
    ).toBe("Explore standards versus ownership");
  });

  it("uses a concise coaching-purpose fallback", () => {
    const result = getCurrentFocusDisplay({
      coachingPurpose: SARAH_PURPOSE,
    });

    expect(result).toMatch(/delegation/i);
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result).not.toBe(SARAH_PURPOSE);
  });
});

describe("isMeaningfullyDuplicateText", () => {
  it("treats punctuation-only differences as duplicates", () => {
    expect(
      isMeaningfullyDuplicateText(
        "Build confidence in delegation.",
        "build confidence in delegation"
      )
    ).toBe(true);
  });

  it("ignores a leading to", () => {
    expect(
      isMeaningfullyDuplicateText(
        "To build confidence in delegation",
        "Build confidence in delegation"
      )
    ).toBe(true);
  });

  it("returns false when either value is empty", () => {
    expect(isMeaningfullyDuplicateText("", "Focus")).toBe(false);
    expect(isMeaningfullyDuplicateText("Focus", null)).toBe(false);
  });
});

describe("duplication guard", () => {
  it("keeps position and derives a distinct focus when values match", () => {
    const model = buildCurrentPositionPanelModel({
      approvedCurrentPosition: SARAH_PURPOSE,
      currentFocus: SARAH_PURPOSE,
      coachingPurpose: SARAH_PURPOSE,
      clientName: "Sarah Thompson",
    });

    expect(model.statement).toBeTruthy();
    expect(model.currentFocus).toBeTruthy();
    expect(
      isMeaningfullyDuplicateText(model.statement, model.currentFocus)
    ).toBe(false);
  });

  it("shows clarify copy when no distinct focus can be derived", () => {
    const model = buildCurrentPositionPanelModel({
      approvedCurrentPosition: "Focus to be clarified in the next conversation.",
      currentFocus: "Focus to be clarified in the next conversation.",
      clientName: "Sarah Thompson",
    });

    expect(model.currentFocus).toBe(
      "Focus to be clarified in the next conversation."
    );
  });
});

describe("outstanding commitments", () => {
  it("handles no outstanding commitment", () => {
    const result = getOutstandingCommitmentDisplay({});
    expect(result.commitment).toBe("No outstanding commitment.");
    expect(result.hasMore).toBe(false);
  });

  it("rejects outcome narratives as outstanding commitments", () => {
    const result = getOutstandingCommitmentDisplay({
      outstandingCommitment:
        "Sarah reflected on an experience of stepping back from an operational issue and recognised that quality was maintained. The session also explored her awareness of wanting to improve confidence.",
    });
    expect(result.commitment).toBe("No outstanding commitment.");
  });

  it("clips a long commitments at a complete word", () => {
    const long =
      "Ask each manager what they believe should happen before offering an answer and then summarise the options with the wider leadership team during the weekly operations review meeting next Tuesday afternoon.";
    const result = getOutstandingCommitmentDisplay({
      outstandingCommitment: long,
    });
    expect(result.commitment.length).toBeLessThanOrEqual(181);
    expect(result.commitment.endsWith("…")).toBe(true);
    expect(result.commitment).not.toMatch(/afternoo…/);
  });

  it("surfaces one commitment and indicates when more exist", () => {
    const result = getOutstandingCommitmentDisplay({
      commitments: [
        "Continue asking supervisors to propose solutions before offering advice.",
        "Protect weekly thinking time.",
      ],
    });

    expect(result.commitment).toContain("propose solutions");
    expect(result.hasMore).toBe(true);
    expect(result.additionalCount).toBe(1);
  });
});

describe("approved evidence guards", () => {
  it("excludes private notes from session evidence", () => {
    const sessions = [
      makeSession({
        summaryStatus: "approved",
        aiSummaryApproved: true,
        summary: SARAH_APPROVED_SUMMARY,
        notes: "Private note that must never appear on Current Position.",
      }),
    ];

    const evidence = getLatestApprovedSessionEvidence(sessions);
    expect(evidence).toBe(SARAH_APPROVED_SUMMARY);
    expect(evidence).not.toContain("Private note");
  });

  it("excludes unapproved AI content", () => {
    const sessions = [
      makeSession({
        summaryStatus: "draft",
        aiSummaryApproved: false,
        summary: "Unapproved draft summary that should not display.",
      }),
    ];

    expect(getLatestApprovedSessionEvidence(sessions)).toBeNull();
  });
});

describe("Sarah regression", () => {
  it("keeps currentPosition and currentFocus distinct after display normalisation", () => {
    const sessions = [
      makeSession({
        status: "awaiting_completion",
        summaryStatus: "approved",
        aiSummaryApproved: true,
        summary: SARAH_APPROVED_SUMMARY,
        commitments:
          "- Continue asking supervisors to propose solutions before offering advice.\n- Introduce short reflective discussions after significant incidents.",
      }),
    ];

    const model = buildCurrentPositionPanelModel({
      identitySummary: null,
      approvedSessionEvidence: getLatestApprovedSessionEvidence(sessions),
      currentFocus: SARAH_PURPOSE,
      coachingPurpose: SARAH_PURPOSE,
      clientName: "Sarah Thompson",
      commitments: getLatestApprovedSessionCommitments(sessions),
    });

    expect(normaliseDisplayText(model.statement)).not.toBe(
      normaliseDisplayText(model.currentFocus)
    );
    expect(
      isMeaningfullyDuplicateText(model.statement, model.currentFocus)
    ).toBe(false);
    expect(model.statement).toContain("stepping back");
    expect(model.currentFocus.toLowerCase()).toContain("delegation");
    expect(model.outstandingCommitment.toLowerCase()).toContain("supervisors");
    expect(model.commitmentHasMore).toBe(true);
  });

  it("uses identity summary as present-state when available", () => {
    const model = buildCurrentPositionPanelModel({
      identitySummary: SARAH_IDENTITY,
      currentFocus: SARAH_PURPOSE,
      coachingPurpose: SARAH_PURPOSE,
      clientName: "Sarah Thompson",
      outstandingCommitment:
        "Continue asking supervisors to propose solutions before offering advice.",
    });

    expect(model.statement).toContain("leading through others");
    expect(model.currentFocus).not.toEqual(model.statement);
    expect(createConciseFocus(SARAH_PURPOSE).length).toBeLessThanOrEqual(120);
  });
});
