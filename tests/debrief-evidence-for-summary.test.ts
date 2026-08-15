import { describe, expect, it } from "vitest";
import { buildDraftSummaryInput } from "@/lib/ai/draft-summary-prompt";
import {
  applyDebriefValuesToSession,
} from "@/components/reflect/session-debrief-form";
import {
  buildDebriefEvidenceForSummary,
  commitmentTextForSummaryAi,
  draftSummaryNotesFromSavedSession,
  isNoCommitmentAgreedMarker,
  NO_COMMITMENT_AGREED_MARKER,
} from "@/lib/summary-insights/debrief-evidence-for-summary";
import { createBlankSession } from "@/lib/sessions";
import type { Session } from "@/lib/types";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    ...createBlankSession({
      id: "session-3",
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: 3,
      status: "awaiting_completion",
    }),
    ...overrides,
  };
}

describe("buildDebriefEvidenceForSummary", () => {
  it("includes Capture Outcome reflect narrative", () => {
    const evidence = buildDebriefEvidenceForSummary(
      makeSession({
        reflectWhatSurprised:
          "Alex agreed to practise doing this in the next relevant project discussion.",
      })
    );
    expect(evidence).toContain(
      "Alex agreed to practise doing this in the next relevant project discussion."
    );
  });

  it("includes live session.notes without overwriting narrative", () => {
    const evidence = buildDebriefEvidenceForSummary(
      makeSession({
        reflectWhatSurprised: "Ownership landed differently in the room.",
        notes: "Live note: Alex agreed to practise doing this in the next relevant project discussion.",
      })
    );
    expect(evidence).toContain("Ownership landed differently in the room.");
    expect(evidence).toContain(
      "Live note: Alex agreed to practise doing this in the next relevant project discussion."
    );
  });

  it("includes genuine commitment text", () => {
    const evidence = buildDebriefEvidenceForSummary(
      makeSession({
        reflectWhatSurprised: "Useful shift in influence.",
        commitments:
          "Alex agreed to practise stating a clear recommendation next time.",
      })
    );
    expect(evidence).toContain(
      "Alex agreed to practise stating a clear recommendation next time."
    );
  });

  it("excludes the No commitment was agreed marker from model input", () => {
    const evidence = buildDebriefEvidenceForSummary(
      makeSession({
        reflectWhatSurprised:
          "Alex agreed to practise doing this in the next relevant project discussion.",
        commitments: NO_COMMITMENT_AGREED_MARKER,
      })
    );
    expect(evidence).toContain(
      "Alex agreed to practise doing this in the next relevant project discussion."
    );
    expect(evidence).not.toContain(NO_COMMITMENT_AGREED_MARKER);
    expect(evidence.toLowerCase()).not.toContain("no commitment was agreed");
  });

  it("keeps explicit Alex agreed to wording in the final draft-summary input", () => {
    const agreement =
      "Alex agreed to practise doing this in the next relevant project discussion.";
    const evidence = buildDebriefEvidenceForSummary(
      makeSession({
        reflectWhatSurprised: agreement,
        notes: "Live capture of the same conversation.",
        commitments: NO_COMMITMENT_AGREED_MARKER,
      })
    );
    const input = buildDraftSummaryInput(evidence, "standard");
    expect(input).toContain("CONVERSATION NOTES");
    expect(input).toContain(agreement);
    expect(input).not.toContain(NO_COMMITMENT_AGREED_MARKER);
  });
});

describe("no-commitment marker handling", () => {
  it("detects the UI marker and drops it from AI commitment text", () => {
    expect(isNoCommitmentAgreedMarker(NO_COMMITMENT_AGREED_MARKER)).toBe(true);
    expect(isNoCommitmentAgreedMarker("No commitment was agreed.")).toBe(true);
    expect(commitmentTextForSummaryAi(NO_COMMITMENT_AGREED_MARKER)).toBe("");
    expect(
      commitmentTextForSummaryAi("Follow up with the project sponsor")
    ).toBe("Follow up with the project sponsor");
  });

  it("preserves the marker on the session for UI restoration", () => {
    const next = applyDebriefValuesToSession(makeSession(), {
      narrative: "What changed in the conversation.",
      commitment: "",
      privateReminder: "",
      followUp: "",
      noCommitmentAgreed: true,
    });
    expect(next.commitments).toBe(NO_COMMITMENT_AGREED_MARKER);
    expect(next.agreedActions).toBe("");
    expect(buildDebriefEvidenceForSummary(next)).not.toContain(
      NO_COMMITMENT_AGREED_MARKER
    );
    expect(buildDebriefEvidenceForSummary(next)).toContain(
      "What changed in the conversation."
    );
  });
});

describe("saved session used for summary generation", () => {
  it("builds draft notes from the saved session, not a stale pre-save object", () => {
    const selectedSessionId = "session-3";
    const stalePreSave = makeSession({
      id: selectedSessionId,
      reflectWhatSurprised: "",
      notes: "",
      commitments: "",
    });
    const savedAfterDebrief = makeSession({
      id: selectedSessionId,
      reflectWhatSurprised:
        "Alex agreed to practise doing this in the next relevant project discussion.",
      notes: "Live session notes retained.",
      commitments: NO_COMMITMENT_AGREED_MARKER,
    });

    // Stale object must not be used once save has returned the updated session.
    expect(buildDebriefEvidenceForSummary(stalePreSave)).not.toContain(
      "Alex agreed to practise"
    );

    const notes = draftSummaryNotesFromSavedSession({
      savedSession: savedAfterDebrief,
      selectedSessionId,
    });
    expect(notes).toContain(
      "Alex agreed to practise doing this in the next relevant project discussion."
    );
    expect(notes).toContain("Live session notes retained.");
    expect(notes).not.toContain(NO_COMMITMENT_AGREED_MARKER);

    expect(() =>
      draftSummaryNotesFromSavedSession({
        savedSession: { ...savedAfterDebrief, id: "other-session" },
        selectedSessionId,
      })
    ).toThrow(/does not match the selected session/i);
  });
});
