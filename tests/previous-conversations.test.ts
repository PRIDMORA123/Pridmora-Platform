import { describe, expect, it } from "vitest";
import {
  buildPreviousConversationCard,
  clipConversationCardText,
  getConversationCardCommitment,
  getConversationCardOutcome,
  getConversationCardTitle,
  selectPreviousConversations,
} from "@/lib/relationship-workspace/previous-conversations";
import { createBlankSession } from "@/lib/sessions";
import type { Session } from "@/lib/types";

function makeSession(
  overrides: Partial<Session> & { sessionNumber?: number } = {}
): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status ?? "completed",
    }),
    ...overrides,
  };
}

describe("previous conversation card helpers", () => {
  it("prefers an explicit session title and never mid-word truncates", () => {
    const session = makeSession({
      title: "Practising stepping back from operational detail",
      focus:
        "To build confidence and capability as a new operational leader by strengthening delegation, accountability, strategic thinking and leadership presence across every setting.",
      prepPurpose:
        "To build confidence and capability as a new operational leader by strengthening delegation, accountability, strategic thinking and leadership presence across every setting.",
    });

    const title = getConversationCardTitle(session);
    expect(title).toBe("Practising stepping back from operational detail");
    expect(title).not.toContain("strengthening delegation");
  });

  it("falls back to Development Conversation {n} rather than full purpose", () => {
    const session = makeSession({
      sessionNumber: 3,
      title: "",
      focus: "",
      prepPurpose:
        "To build confidence and capability as a new operational leader by strengthening delegation, accountability, strategic thinking and leadership presence.",
    });

    expect(getConversationCardTitle(session)).toBe(
      "Development Conversation 3"
    );
  });

  it("keeps outcome and commitment concise without mid-word cuts", () => {
    const session = makeSession({
      outcomes:
        "She described a clearer pause before solving problems for others and began inviting supervisors to own the next step. Additional narrative that should not all appear on the card remains available inside the conversation view for later reading.",
      commitments:
        "Ask each manager what they believe should happen before offering an answer and then capture the options with the leadership group in the next operations review.",
    });

    const outcome = getConversationCardOutcome(session);
    const commitment = getConversationCardCommitment(session);

    expect(outcome.length).toBeLessThanOrEqual(181);
    expect(commitment.length).toBeLessThanOrEqual(161);
    expect(outcome).not.toMatch(/\w…\w/);
    expect(commitment).not.toMatch(/\w…\w/);
    expect(outcome.toLowerCase()).toContain("clearer pause");
    expect(commitment.toLowerCase()).toContain("ask each manager");
  });

  it("uses an honest empty commitment state", () => {
    expect(
      getConversationCardCommitment(
        makeSession({ commitments: "", agreedActions: "" })
      )
    ).toBe("No commitment was agreed");
  });

  it("does not render the full preparation purpose on the card", () => {
    const purpose =
      "To build confidence and capability as a new operational leader by strengthening delegation, accountability, strategic thinking and leadership presence.";
    const card = buildPreviousConversationCard(
      makeSession({
        title: "",
        focus: "",
        prepPurpose: purpose,
        outcomes: "Ownership improved in one supervision discussion.",
        commitments: "Invite supervisors to propose solutions first.",
      })
    );

    expect(card.title).toBe("Development Conversation 1");
    expect(card.outcome).not.toBe(purpose);
    expect(card.commitment).not.toBe(purpose);
    expect(JSON.stringify(card)).not.toContain(purpose);
  });

  it("limits visible cards to three", () => {
    const sessions = [1, 2, 3, 4].map(number =>
      makeSession({
        id: `s${number}`,
        sessionNumber: number,
        status: "completed",
        title: `Session ${number}`,
      })
    );

    const selected = selectPreviousConversations(sessions, null);
    expect(selected.visible).toHaveLength(3);
    expect(selected.hasMore).toBe(true);
  });

  it("clips preview text only after complete words", () => {
    const clipped = clipConversationCardText(
      "building capability and accountability in every operational setting",
      36
    );
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped).not.toMatch(/accountabili…/);
  });
});
