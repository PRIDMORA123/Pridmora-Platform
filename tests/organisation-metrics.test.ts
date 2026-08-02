import { describe, expect, it } from "vitest";
import {
  countActivePractitioners,
  countAwaitingSessionNotes,
  isAwaitingSessionNotes,
  isConversationThisMonth,
  METRIC_DEFINITIONS,
} from "@/lib/organisations/metric-definitions";
import {
  formatAssignmentRoleLabel,
  formatMembershipStatusLabel,
  formatOrganisationDate,
  formatProfessionalRoleLabel,
  organisationInitials,
  retentionPolicyDisplayLabel,
} from "@/lib/organisations/format";

describe("organisation metric definitions", () => {
  it("counts assigned owners as active practitioners", () => {
    const count = countActivePractitioners(
      [
        { userId: "barry", role: "owner", status: "active" },
        { userId: "admin", role: "administrator", status: "active" },
      ],
      [
        {
          userId: "barry",
          assignmentRole: "primary",
          status: "active",
        },
      ]
    );
    expect(count).toBe(1);
  });

  it("counts practitioner-role members even without assignments", () => {
    expect(
      countActivePractitioners(
        [{ userId: "p1", role: "practitioner", status: "active" }],
        []
      )
    ).toBe(1);
  });

  it("does not count oversight members with assignments", () => {
    expect(
      countActivePractitioners(
        [{ userId: "o1", role: "oversight", status: "active" }],
        [{ userId: "o1", assignmentRole: "primary", status: "active" }]
      )
    ).toBe(0);
  });

  it("awaiting notes only includes ended sessions without notes", () => {
    expect(
      isAwaitingSessionNotes({
        status: "awaiting_completion",
        notesSavedAt: null,
      })
    ).toBe(true);
    expect(
      isAwaitingSessionNotes({
        status: "in_progress",
        notesSavedAt: null,
      })
    ).toBe(false);
    expect(
      isAwaitingSessionNotes({
        status: "planned",
        notesSavedAt: null,
      })
    ).toBe(false);
    expect(
      isAwaitingSessionNotes({
        status: "completed",
        notesSavedAt: null,
      })
    ).toBe(false);
    expect(
      isAwaitingSessionNotes({
        status: "awaiting_completion",
        notesSavedAt: "2026-08-01T12:00:00.000Z",
      })
    ).toBe(false);
    expect(
      isAwaitingSessionNotes({
        status: "awaiting_completion",
        notesSavedAt: null,
        archivedAt: "2026-08-01T12:00:00.000Z",
      })
    ).toBe(false);

    expect(
      countAwaitingSessionNotes([
        { status: "awaiting_completion", notesSavedAt: null },
        { status: "in_progress", notesSavedAt: null },
        { status: "completed", notesSavedAt: "2026-08-01T12:00:00.000Z" },
      ])
    ).toBe(1);
  });

  it("conversation monthly count excludes planned sessions", () => {
    const monthStart = "2026-08-01T00:00:00.000Z";
    expect(
      isConversationThisMonth(
        {
          status: "in_progress",
          notesSavedAt: null,
          updatedAt: "2026-08-02T10:00:00.000Z",
        },
        monthStart
      )
    ).toBe(true);
    expect(
      isConversationThisMonth(
        {
          status: "planned",
          notesSavedAt: null,
          updatedAt: "2026-08-02T10:00:00.000Z",
        },
        monthStart
      )
    ).toBe(false);
  });

  it("documents metric definitions", () => {
    expect(METRIC_DEFINITIONS.activePractitioners).toMatch(/assignment/i);
    expect(METRIC_DEFINITIONS.awaitingSessionNotes).toMatch(
      /awaiting_completion/
    );
  });
});

describe("organisation formatting", () => {
  it("formats UK-readable dates", () => {
    expect(formatOrganisationDate("2026-08-02T12:00:00.000Z")).toMatch(
      /2 Aug 2026/
    );
  });

  it("title-cases professional roles and statuses", () => {
    expect(formatProfessionalRoleLabel("coach")).toBe("Coach");
    expect(formatMembershipStatusLabel("active")).toBe("Active");
    expect(formatAssignmentRoleLabel("primary")).toBe("Primary");
    expect(formatAssignmentRoleLabel("co_practitioner")).toBe(
      "Co-practitioner"
    );
  });

  it("builds initials and retention labels", () => {
    expect(organisationInitials("Barry Pridmore")).toBe("BP");
    expect(retentionPolicyDisplayLabel("standard")).toEqual({
      label: "Standard retention policy",
      readOnly: true,
    });
  });
});
