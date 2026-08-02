import { describe, expect, it } from "vitest";
import {
  parseAgreement,
  parseInitialConversation,
  parseSupportingContext,
  supportingContextForAi,
  agreementStatusLabel,
} from "@/lib/relationship-meta";

describe("relationship meta", () => {
  it("defaults agreement to not recorded without implying legal validity", () => {
    const agreement = parseAgreement(null);
    expect(agreement.status).toBe("not_recorded");
    expect(agreementStatusLabel("agreed")).toBe("Agreement recorded");
  });

  it("keeps initial conversation optional and separate from Session 1", () => {
    const initial = parseInitialConversation({
      recorded: true,
      outcome: "proceed",
      notes: "Good fit",
      occurredOn: "2026-07-01",
    });
    expect(initial.recorded).toBe(true);
    expect(initial.convertedToSessionId).toBeNull();
    expect(parseInitialConversation(null).recorded).toBe(false);
  });

  it("only passes opted-in supporting context to AI preparation", () => {
    const items = parseSupportingContext([
      {
        id: "1",
        title: "Elevate baseline",
        sourceType: "elevate_baseline",
        sourceDate: "2026-01-01",
        summary: "Strengths in stakeholder leadership",
        useForAiPreparation: false,
      },
      {
        id: "2",
        title: "Personal objectives",
        sourceType: "personal_objectives",
        sourceDate: "2026-02-01",
        summary: "Grow influence",
        useForAiPreparation: true,
      },
    ]);
    expect(items).toHaveLength(2);
    expect(supportingContextForAi(items).map(item => item.id)).toEqual(["2"]);
  });
});
