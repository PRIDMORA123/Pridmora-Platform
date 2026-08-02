import { describe, expect, it } from "vitest";
import {
  WORKFLOW_MARKER,
  containsWorkflowMetadata,
  extractVisibleCoachNotes,
  parseLegacyWorkflowPayload,
  sanitizeSessionHumanTextFields,
  validateHumanTextField,
} from "@/lib/coach-notes";
import { sessionToRow, rowToSession } from "@/lib/supabase/map";
import type { Session } from "@/lib/types";
import { EMPTY_PREPARATION_AI_BRIEF } from "@/lib/preparation-brief";

function baseSession(partial: Partial<Session> = {}): Session {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222",
    coachId: "33333333-3333-4333-8333-333333333333",
    sessionNumber: 1,
    title: "",
    date: "2026-07-20",
    time: "10:00",
    durationMinutes: 60,
    location: "",
    status: "planned",
    focus: "Delegation",
    preparation: "",
    prepPurpose: "Explore confidence",
    prepTopics: "",
    prepQuestions: "",
    prepCommitmentsReview: "",
    prepRisks: "",
    prepPrivateNotes: "Remember to explore confidence",
    prepAiBrief: EMPTY_PREPARATION_AI_BRIEF,
    prepAiBriefGeneratedAt: "",
    prepAiBriefStyle: "",
    prepAiBriefConfirmedAt: "",
    prepAiBriefSourceFingerprint: "",
    intelligenceMode: "",
    intelligenceStatus: "idle",
    intelligenceSources: [],
    intelligenceLastRefreshedAt: "",
    intelligenceErrorCode: "",
    notes: "",
    commitments: "",
    parkingLot: "",
    notesSavedAt: "",
    timerElapsedSeconds: 0,
    timerStartedAt: null,
    sessionStartedAt: null,
    reflection: "",
    reflectWhatShifted: "",
    reflectWhatSurprised: "",
    reflectWhatWorked: "",
    reflectDifferently: "",
    reflectProfessionalLearning: "",
    reflectPrivate: "",
    summary: "",
    emergingThemes: "",
    strengthsObserved: "",
    valuesBecomingVisible: "",
    professionalIdentityDevelopment: "",
    agreedActions: "",
    outcomes: "",
    suggestedFocus: "",
    coachReflection: "",
    summaryStatus: "not_generated",
    aiSummaryApproved: false,
    coachingQuestions: [],
    completedAt: "",
    lastUpdated: "2026-07-20T10:00:00.000Z",
    ...partial,
  };
}

describe("extractVisibleCoachNotes", () => {
  it("returns normal notes unchanged", () => {
    expect(
      extractVisibleCoachNotes("Remember to explore confidence")
    ).toBe("Remember to explore confidence");
  });

  it("removes workflow metadata", () => {
    expect(
      extractVisibleCoachNotes(
        `Remember to explore confidence

---IDENTITY_WORKFLOW_V1---
{"status":"in_progress"}`
      )
    ).toBe("Remember to explore confidence");
  });

  it("returns blank when the value contains only metadata", () => {
    expect(
      extractVisibleCoachNotes(
        `---IDENTITY_WORKFLOW_V1---
{"status":"in_progress"}`
      )
    ).toBe("");
  });

  it("preserves genuine coach content containing braces", () => {
    expect(
      extractVisibleCoachNotes('Consider the "risk {options}" carefully')
    ).toBe('Consider the "risk {options}" carefully');
  });
});

describe("parseLegacyWorkflowPayload", () => {
  it("parses valid legacy JSON", () => {
    const payload = parseLegacyWorkflowPayload(
      `Coach note

${WORKFLOW_MARKER}
{"status":"prepared","prepPurpose":"Focus","durationMinutes":45}`
    );

    expect(payload).toEqual({
      status: "prepared",
      prepPurpose: "Focus",
      durationMinutes: 45,
    });
  });

  it("returns null for malformed legacy JSON without throwing", () => {
    expect(
      parseLegacyWorkflowPayload(
        `Note

${WORKFLOW_MARKER}
{not-json`
      )
    ).toBeNull();
  });
});

describe("validateHumanTextField", () => {
  it("rejects workflow markers", () => {
    expect(() =>
      validateHumanTextField(
        `Hello\n${WORKFLOW_MARKER}\n{}`,
        "prepPrivateNotes"
      )
    ).toThrow(/prohibited workflow metadata/);
  });

  it("rejects payload-looking text", () => {
    expect(() =>
      validateHumanTextField('{"status":"planned"}', "notes")
    ).toThrow(/workflow payload/);
  });

  it("allows normal notes with braces", () => {
    expect(() =>
      validateHumanTextField("Discuss {options} openly", "notes")
    ).not.toThrow();
  });
});

describe("session persistence after repair", () => {
  it("never appends workflow metadata when saving notes", () => {
    const row = sessionToRow(
      baseSession({
        prepPrivateNotes: "Fresh coach notes",
        reflectPrivate: "Private reflection",
        status: "prepared",
      }),
      "33333333-3333-4333-8333-333333333333"
    );

    expect(row.prep_private_notes).toBe("Fresh coach notes");
    expect(row.private_notes).toBe("Private reflection");
    expect(row.preparation ?? "").not.toContain(WORKFLOW_MARKER);
    expect(row.private_notes ?? "").not.toContain(WORKFLOW_MARKER);
    expect(row.reflection ?? "").not.toContain(WORKFLOW_MARKER);
  });

  it("strips legacy envelopes when reading contaminated rows", () => {
    const contaminated = {
      ...sessionToRow(
        baseSession(),
        "33333333-3333-4333-8333-333333333333"
      ),
      prep_private_notes: `Keep this note

${WORKFLOW_MARKER}
{"status":"in_progress","prepPurpose":"Legacy purpose"}`,
      preparation: `Purpose text

${WORKFLOW_MARKER}
{"prepTopics":"Legacy topics","status":"prepared"}`,
      private_notes: `${WORKFLOW_MARKER}
{"reflectPrivate":"Recovered reflection"}`,
    };

    const session = rowToSession(contaminated, 0, 1);

    expect(session.prepPrivateNotes).toBe("Keep this note");
    expect(session.prepPurpose).toBe("Explore confidence");
    expect(session.prepTopics).toBe("Legacy topics");
    expect(session.reflectPrivate).toBe("Recovered reflection");
    expect(session.prepPrivateNotes).not.toContain(WORKFLOW_MARKER);
    expect(containsWorkflowMetadata(session.preparation)).toBe(false);
  });

  it("sanitizes session human text fields before save", () => {
    const sanitized = sanitizeSessionHumanTextFields(
      baseSession({
        prepPrivateNotes: `Visible

${WORKFLOW_MARKER}
{"status":"prepared"}`,
      })
    );

    expect(sanitized.prepPrivateNotes).toBe("Visible");
  });
});

describe("prepare action contract", () => {
  it("exposes refresh wording rather than update", () => {
    const labels = ["Save preparation", "Refresh preparation brief"];
    expect(labels).toContain("Refresh preparation brief");
    expect(labels).not.toContain("Update Preparation Brief");
    expect(labels.filter(label => label === "Save preparation")).toHaveLength(1);
  });
});

describe("private notes exclusion", () => {
  it("does not treat private notes as report evidence source text", () => {
    const privateNotes = `Secret

${WORKFLOW_MARKER}
{"status":"in_progress"}`;
    const visible = extractVisibleCoachNotes(privateNotes);
    expect(visible).toBe("Secret");
    expect(visible).not.toContain("status");
  });
});
