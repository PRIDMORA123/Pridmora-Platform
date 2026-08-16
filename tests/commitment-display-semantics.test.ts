import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IDENTITY_EMPTY_STATES,
  priorOpenCommitmentsHint,
} from "@/lib/identity-empty-states";

describe("session Actions empty-state semantics", () => {
  it("uses conversation-scoped empty copy", () => {
    expect(IDENTITY_EMPTY_STATES.noCommitmentsFromConversation.title).toBe(
      "No commitments from this conversation"
    );
    expect(
      IDENTITY_EMPTY_STATES.noCommitmentsFromConversation.description
    ).toBe("No new commitments were recorded in this conversation.");
  });

  it("keeps relationship-wide empty copy for person Actions", () => {
    expect(IDENTITY_EMPTY_STATES.noCommitments.title).toBe(
      "No open commitments"
    );
  });

  it("formats prior-open secondary hint", () => {
    expect(priorOpenCommitmentsHint(0)).toBeNull();
    expect(priorOpenCommitmentsHint(1)).toBe(
      "1 commitment remains open from an earlier conversation."
    );
    expect(priorOpenCommitmentsHint(3)).toBe(
      "3 commitments remain open from earlier conversations."
    );
  });

  it("wires session-scoped empty state into SessionNextSteps and ActionsWorkspace", () => {
    const steps = readFileSync(
      resolve("components/actions/session-next-steps.tsx"),
      "utf8"
    );
    const workspace = readFileSync(
      resolve("components/actions/actions-workspace.tsx"),
      "utf8"
    );
    const sessionWorkspace = readFileSync(
      resolve("components/session-workspace.tsx"),
      "utf8"
    );

    expect(steps).toContain("noCommitmentsFromConversation");
    expect(steps).toContain("priorOpenCommitmentsHint");
    expect(steps).toContain("sessionScoped");
    expect(workspace).toContain("sessionScoped");
    expect(workspace).toContain("noCommitmentsFromConversation");
    expect(sessionWorkspace).toContain("priorOpenCommitmentCount={outstanding.length}");
  });
});

describe("Current Position outstanding source", () => {
  it("does not fall back to currentPosition.commitment session text", () => {
    const coachSpace = readFileSync(
      resolve("components/coach-space-view.tsx"),
      "utf8"
    );
    expect(coachSpace).toContain(
      "outstandingCommitment={page.lookingAhead.commitments[0] || null}"
    );
    expect(coachSpace).not.toMatch(
      /outstandingCommitment=\{[\s\S]*currentPosition\.commitment/
    );
  });

  it("does not inject latest approved session commitments into outstanding", () => {
    const panel = readFileSync(
      resolve("components/relationship-workspace/current-position-panel.tsx"),
      "utf8"
    );
    expect(panel).not.toContain("getLatestApprovedSessionCommitments");
    expect(panel).toContain("canonicalOpen");
  });
});
