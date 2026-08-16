/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { RelationshipCanvas } from "@/components/relationship-workspace";
import { SessionModuleTile } from "@/components/relationship-workspace/session-module-tile";
import { createBlankSession } from "@/lib/sessions";
import {
  EMPTY_AGREEMENT,
  EMPTY_INITIAL_CONVERSATION,
} from "@/lib/relationship-meta";
import type { Client, Session } from "@/lib/types";
import type { CoachingMoment } from "@/lib/coaching-moments/coaching-moment";
import { OrganisationProvider } from "@/lib/organisations/organisation-context";
import type { OrganisationWorkspaceState } from "@/lib/organisations/organisation-context";
import type { ProfessionalRole } from "@/lib/organisations/types";

function makeOrgState(
  professionalRole: ProfessionalRole | null
): OrganisationWorkspaceState {
  return {
    organisation: {
      id: "org-1",
      name: "Test Org",
      slug: "test-org",
      organisationType: "business",
      status: "active",
      createdBy: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      archivedAt: null,
      defaultPreparationStyle: "guided",
      aiEnabled: true,
      dataRetentionPolicyLabel: "standard",
      brandingStatus: "none",
      logoUrl: null,
      licence: {
        planName: "Sample",
        seatsPurchased: 5,
        status: "active",
        startsAt: null,
        endsAt: null,
      },
    },
    membership: {
      id: "mem-1",
      organisationId: "org-1",
      userId: "user-1",
      role: "owner",
      professionalRole,
      status: "active",
      invitedBy: null,
      invitedAt: null,
      joinedAt: "2026-01-01T00:00:00.000Z",
      deactivatedAt: null,
      lastActiveAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    role: "owner",
    professionalRole,
    organisations: [],
  };
}

function withRole(professionalRole: ProfessionalRole, node: ReactNode) {
  return (
    <OrganisationProvider initial={makeOrgState(professionalRole)}>
      {node}
    </OrganisationProvider>
  );
}

function makeSession(
  overrides: Partial<Session> & { sessionNumber?: number } = {}
): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: "client-sarah",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status ?? "planned",
      title: overrides.title,
      focus: overrides.focus,
      date: overrides.date,
    }),
    ...overrides,
  };
}

function makeClient(sessions: Session[]): Client {
  return {
    id: "client-sarah",
    name: "Sarah Thompson",
    initials: "ST",
    organisation: "Northbridge NHS Trust",
    role: "Operations Manager",
    email: "",
    status: "Active",
    createdAt: "2026-07-12T10:00:00.000Z",
    nextSession: "",
    currentFocus: "Build confidence in enabling supervisors",
    identitySummary:
      "Sarah is moving from direct operational problem-solving towards leading through others.",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [
      {
        id: "1",
        name: "Reflective practice",
        stage: "Developing",
        evidence: "",
      },
      {
        id: "2",
        name: "Commitment to developing others",
        stage: "Emerging",
        evidence: "",
      },
    ],
    values: [],
    themes: ["Delegation", "Accountability", "Strategic leadership", "Confidence"],
    goals: [],
    actions: [],
    quotes: [],
    sessions,
    journey: [],
  };
}

const details = {
  agreement: EMPTY_AGREEMENT,
  initialConversation: EMPTY_INITIAL_CONVERSATION,
  supportingContext: [],
};

function makeMoment(overrides: Partial<CoachingMoment> = {}): CoachingMoment {
  return {
    id: "moment-1",
    relationshipId: "client-sarah",
    clientId: "client-sarah",
    coachId: "coach-1",
    createdBy: "coach-1",
    occurredAt: "2026-07-29T10:00:00.000Z",
    status: "complete",
    situation: "Team challenge discussion",
    desiredOutcome: null,
    inferredType: null,
    generatedIntention: null,
    generatedOpening: null,
    generatedQuestions: [],
    generatedConsideration: null,
    relevantContext: null,
    privateNote: "",
    outcomeNotes: null,
    agreedCommitment: null,
    noCommitmentAgreed: false,
    followUp: null,
    generatedInsight: null,
    insightStatus: "not_requested",
    guidanceFingerprint: null,
    archivedAt: null,
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    ...overrides,
  };
}

const mountedCanvases: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> =
  [];

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(withRole("manager", node));
  });
  mountedCanvases.push({ root, container });
  return { container, root };
}

function sectionOrder(container: HTMLElement): string[] {
  const ids = [
    "who-is-person-title",
    "current-development-title",
    "current-position-title",
    "development-snapshot-title",
    "current-conversation-title",
    "previous-conversations-title",
    "reports-title",
    "coaching-moments-title",
    "relationship-details-title",
  ];
  return ids
    .map(id => container.querySelector(`#${id}`))
    .filter((node): node is Element => Boolean(node))
    .sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    )
    .map(node => node.id);
}

afterEach(async () => {
  for (const entry of mountedCanvases.splice(0)) {
    try {
      await act(async () => {
        entry.root.unmount();
      });
    } catch {
      // Already unmounted by the test body.
    }
    entry.container.remove();
  }
});

describe("SessionModuleTile", () => {
  it("is fully clickable as a button", async () => {
    const onClick = vi.fn();
    const { container, root } = await renderNode(
      <SessionModuleTile
        title="Prepare"
        description="Review the focus and questions for this conversation."
        status="ready"
        statusLabel="Ready"
        actionLabel="Review preparation"
        onClick={onClick}
      />
    );

    const button = container.querySelector("button.session-module-tile");
    expect(button).toBeTruthy();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledOnce();
    root.unmount();
    container.remove();
  });

  it("marks the current module with aria-current=step", async () => {
    const { container, root } = await renderNode(
      <SessionModuleTile
        title="Conversation"
        description="Stay present."
        status="current"
        statusLabel="Current"
        actionLabel="Start conversation"
        current
        onClick={() => undefined}
      />
    );
    expect(
      container.querySelector('button[aria-current="step"]')
    ).toBeTruthy();
    root.unmount();
    container.remove();
  });

  it("renders Summary & Insights with optional treatment", async () => {
    const { container, root } = await renderNode(
      <SessionModuleTile
        title="Summary & Insights"
        description="Optional summary."
        status="optional"
        statusLabel="Optional"
        actionLabel="Create insight"
        intelligence
        onClick={() => undefined}
      />
    );
    expect(container.textContent).toContain("Optional");
    expect(
      container.querySelector(".session-module-tile--intelligence")
    ).toBeTruthy();
    root.unmount();
    container.remove();
  });
});

describe("RelationshipCanvas", () => {
  it("renders the locked hierarchy with identity first", async () => {
    const session = makeSession({
      sessionNumber: 3,
      title: "Building leadership confidence",
      date: "12 September 2026",
      status: "prepared",
      focus: "Explore ownership while maintaining standards",
      prepPurpose: "Explore ownership while maintaining standards",
    });
    const client = makeClient([session]);

    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={client}
        currentSession={session}
        narrative={client.identitySummary}
        outstandingCommitment="Continue asking supervisors to propose solutions"
        relationshipDetails={details}
        recentCoachingMoments={[makeMoment()]}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
        onNewCoachingMoment={() => undefined}
      />
    );

    expect(container.querySelector("h1")?.textContent).toBe("Sarah Thompson");
    expect(container.textContent).toContain(
      "Operations Manager · Northbridge NHS Trust"
    );
    expect(sectionOrder(container)).toEqual([
      "who-is-person-title",
      "current-development-title",
      "current-position-title",
      "development-snapshot-title",
      "current-conversation-title",
      "previous-conversations-title",
      "reports-title",
      "coaching-moments-title",
      "relationship-details-title",
    ]);
    expect(container.textContent).toContain("Who is Sarah?");
    expect(container.textContent).toContain("Current Development");
    expect(container.textContent).toContain("Building leadership confidence");
    expect(container.textContent).toContain("Session 3");
    expect(container.textContent).toContain("Next conversation");
    expect(container.textContent).toMatch(
      /Prepare for conversation|Review preparation|Continue conversation/
    );
    expect(container.textContent).toContain("Summary & Insights");
    expect(container.querySelector(".current-conversation-card")).toBeTruthy();
    expect(
      container.querySelector('[data-testid="person-next-conversation"]')
    ).toBeTruthy();
  });

  it("places Coaching Moments after Reports and before Relationship Details", async () => {
    const session = makeSession({ status: "planned" });
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([session])}
        currentSession={session}
        relationshipDetails={details}
        recentCoachingMoments={[makeMoment()]}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
        onNewCoachingMoment={() => undefined}
      />
    );

    const reports = container.querySelector("#reports-title");
    const moments = container.querySelector("#coaching-moments-title");
    const detailsHeading = container.querySelector(
      "#relationship-details-title"
    );
    expect(reports && moments && detailsHeading).toBeTruthy();
    expect(
      reports!.compareDocumentPosition(moments!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      moments!.compareDocumentPosition(detailsHeading!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    root.unmount();
    container.remove();
  });

  it("keeps Relationship Details last and collapsed by default", async () => {
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([])}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    const sections = Array.from(container.querySelectorAll("section"));
    const last = sections[sections.length - 1];
    expect(last?.getAttribute("aria-labelledby")).toBe(
      "relationship-details-title"
    );
    expect(container.textContent).toContain(
      "Agreement · Initial conversation · Supporting context · Review point"
    );
    const showButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Show"
    );
    expect(showButton?.getAttribute("aria-expanded")).toBe("false");
    root.unmount();
    container.remove();
  });

  it("shows one primary action only for a planned session", async () => {
    const session = makeSession({
      sessionNumber: 2,
      status: "planned",
      title: "Leadership confidence",
    });
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([session])}
        currentSession={session}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
        onNewCoachingMoment={() => undefined}
      />
    );

    expect(container.textContent).toContain("Next conversation");
    expect(container.textContent).toContain("Prepare for conversation");
    expect(
      container.querySelectorAll(".relationship-workspace__primary-action .identity-button.is-primary")
        .length
    ).toBe(1);
    expect(
      container.querySelector(".current-conversation-card__primary")
    ).toBeNull();
    expect(
      container.querySelector(".current-position-panel__action")
    ).toBeNull();
    const planButtons = Array.from(
      container.querySelectorAll("button")
    ).filter(button => button.textContent === "Plan next conversation");
    expect(planButtons).toHaveLength(0);
    root.unmount();
    container.remove();
  });

  it("offers one Plan next conversation action when no current session exists", async () => {
    const client = makeClient([]);
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={client}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
        onNewCoachingMoment={() => undefined}
      />
    );
    expect(container.textContent).toContain("No conversation is planned yet.");
    expect(container.textContent).toContain("Plan next conversation");
    expect(
      container.querySelector(".relationship-workspace__primary-action")
    ).toBeNull();
    const planButtons = Array.from(
      container.querySelectorAll("button")
    ).filter(button => button.textContent === "Plan next conversation");
    expect(planButtons).toHaveLength(1);
    root.unmount();
    container.remove();
  });

  it("shows a single New Coaching Moment action", async () => {
    const session = makeSession({ status: "planned" });
    const { container, root } = await renderNode(
      withRole(
        "coach",
        <RelationshipCanvas
          relationship={makeClient([session])}
          currentSession={session}
          relationshipDetails={details}
          onPrimaryAction={() => undefined}
          onModuleAction={() => undefined}
          onOpenSession={() => undefined}
          onViewDevelopment={() => undefined}
          onViewReports={() => undefined}
          onCreateSession={async () => undefined}
          onSaveAgreement={async () => undefined}
          onSaveInitialConversation={async () => undefined}
          onNewCoachingMoment={() => undefined}
        />
      )
    );

    const momentButtons = Array.from(
      container.querySelectorAll("button")
    ).filter(button => button.textContent === "New Coaching Moment");
    expect(momentButtons).toHaveLength(1);
    expect(momentButtons[0]?.className).toContain("is-secondary");
    root.unmount();
    container.remove();
  });

  it("disables Coaching Moment creation when archived and preserves history", async () => {
    const archived = {
      ...makeClient([makeSession({ status: "completed" })]),
      status: "Archived" as const,
    };
    const { container, root } = await renderNode(
      withRole(
        "coach",
        <RelationshipCanvas
          relationship={archived}
          archived
          relationshipDetails={details}
          recentCoachingMoments={[
            makeMoment({ situation: "Delegation decision" }),
          ]}
          onPrimaryAction={() => undefined}
          onModuleAction={() => undefined}
          onOpenSession={() => undefined}
          onViewDevelopment={() => undefined}
          onViewReports={() => undefined}
          onCreateSession={async () => undefined}
          onSaveAgreement={async () => undefined}
          onSaveInitialConversation={async () => undefined}
          onNewCoachingMoment={() => undefined}
        />
      )
    );

    expect(container.textContent).toContain("Archived");
    expect(container.textContent).toContain(
      "New Coaching Moments cannot be created"
    );
    expect(container.textContent).toContain("Delegation decision");
    const momentButtons = Array.from(
      container.querySelectorAll("button")
    ).filter(button => button.textContent === "New Coaching Moment");
    expect(momentButtons).toHaveLength(0);
    root.unmount();
    container.remove();
  });

  it("uses development moments copy for manager workspaces", async () => {
    const { container, root } = await renderNode(
      withRole(
        "manager",
        <RelationshipCanvas
          relationship={makeClient([makeSession({ status: "planned" })])}
          relationshipDetails={details}
          coachingMomentsLoadError
          onPrimaryAction={() => undefined}
          onModuleAction={() => undefined}
          onOpenSession={() => undefined}
          onViewDevelopment={() => undefined}
          onViewReports={() => undefined}
          onCreateSession={async () => undefined}
          onSaveAgreement={async () => undefined}
          onSaveInitialConversation={async () => undefined}
          onNewCoachingMoment={() => undefined}
        />
      )
    );

    expect(container.textContent).toContain("Development moments");
    expect(container.textContent).toContain(
      "Development moments are temporarily unavailable."
    );
    expect(container.textContent).not.toContain("Coaching Moments");
    root.unmount();
    container.remove();
  });

  it("caps development snapshot areas at four", async () => {
    const session = makeSession({ status: "planned" });
    const client = makeClient([session]);
    client.strengths = [
      { id: "1", name: "Delegation", stage: "Developing", evidence: "" },
      { id: "2", name: "Accountability", stage: "Developing", evidence: "" },
      { id: "3", name: "Leadership confidence", stage: "Emerging", evidence: "" },
      { id: "4", name: "Strategic focus", stage: "Emerging", evidence: "" },
      { id: "5", name: "Extra theme", stage: "Emerging", evidence: "" },
    ];
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={client}
        currentSession={session}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    expect(
      container.querySelectorAll(".relationship-development-preview__area")
        .length
    ).toBe(4);
    expect(container.textContent).toContain("Development snapshot");
    expect(container.textContent).not.toContain("Extra theme");
    root.unmount();
    container.remove();
  });

  it("shows an explicit outstanding commitment rather than an outcome narrative", async () => {
    const commitment =
      "Ask each manager what they believe should happen before offering an answer.";
    const session = makeSession({
      status: "completed",
      summaryStatus: "approved",
      aiSummaryApproved: true,
      summary:
        "Sarah reflected on an experience of stepping back from an operational issue and recognised that quality was maintained while her supervisor had space to demonstrate capability.",
      commitments: commitment,
    });
    const client = makeClient([session]);

    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={client}
        currentSession={null}
        narrative={client.identitySummary}
        outstandingCommitment={commitment}
        openCommitments={[commitment]}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    expect(container.textContent).toContain("Outstanding commitment");
    expect(container.textContent).toContain(commitment);
    const commitmentValue = container.querySelector(
      ".current-position-panel__details"
    )?.textContent;
    expect(commitmentValue).toContain(commitment);
    expect(commitmentValue).not.toContain(
      "Sarah reflected on an experience of stepping back"
    );
    root.unmount();
    container.remove();
  });

  it("shows no outstanding commitment and view-all when multiple exist", async () => {
    const openCommitments = [
      "Continue asking supervisors to propose solutions before offering advice.",
      "Protect weekly thinking time.",
    ];
    const session = makeSession({
      status: "completed",
      summaryStatus: "approved",
      aiSummaryApproved: true,
      commitments:
        "- Continue asking supervisors to propose solutions before offering advice.\n- Protect weekly thinking time.",
    });

    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([session])}
        currentSession={null}
        outstandingCommitment={openCommitments[0]}
        openCommitments={openCommitments}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    expect(container.textContent).toContain(
      "Continue asking supervisors to propose solutions"
    );
    expect(container.textContent).toContain("View all commitments");
    root.unmount();
    container.remove();
  });

  it("shows previous conversations as distinct quieter cards with a max of three", async () => {
    const previous = [1, 2, 3, 4].map(number =>
      makeSession({
        id: `s${number}`,
        sessionNumber: number,
        status: "completed",
        title: `Session title ${number}`,
        date: `${number} July 2026`,
        outcomes: `Outcome ${number}`,
        commitments: `Commitment ${number}`,
      })
    );
    const current = makeSession({
      id: "s5",
      sessionNumber: 5,
      status: "planned",
      title: "Building leadership confidence",
    });
    const client = makeClient([...previous, current]);

    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={client}
        currentSession={current}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    expect(container.textContent).toContain("Previous conversations");
    expect(
      container.querySelectorAll(".previous-conversation-card").length
    ).toBe(3);
    expect(container.textContent).toContain("View all conversations");
    root.unmount();
    container.remove();
  });

  it("places Development before Reports", async () => {
    const client = makeClient([
      makeSession({ sessionNumber: 1, status: "planned" }),
    ]);
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={client}
        currentSession={client.sessions[0]}
        developmentDirection="Building confidence through delegation"
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );
    const development = container.querySelector("#development-snapshot-title");
    const reports = container.querySelector("#reports-title");
    expect(development && reports).toBeTruthy();
    expect(
      development!.compareDocumentPosition(reports!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(container.textContent).toContain("View development");
    expect(container.textContent).toContain("View reports");
    root.unmount();
    container.remove();
  });

  it("contains section-level failures independently", async () => {
    const session = makeSession({ status: "planned" });
    const { container, root } = await renderNode(
      withRole(
        "coach",
        <RelationshipCanvas
          relationship={makeClient([session])}
          currentSession={session}
          relationshipDetails={details}
          developmentLoadError
          reportsLoadError
          coachingMomentsLoadError
          onPrimaryAction={() => undefined}
          onModuleAction={() => undefined}
          onOpenSession={() => undefined}
          onViewDevelopment={() => undefined}
          onViewReports={() => undefined}
          onCreateSession={async () => undefined}
          onSaveAgreement={async () => undefined}
          onSaveInitialConversation={async () => undefined}
        />
      )
    );

    expect(container.textContent).toContain("Development could not be loaded");
    expect(container.textContent).toContain("Reports temporarily unavailable");
    expect(container.textContent).toContain(
      "Coaching Moments are temporarily unavailable."
    );
    expect(container.querySelector("h1")?.textContent).toBe("Sarah Thompson");
    expect(container.querySelector(".current-conversation-card")).toBeTruthy();
    root.unmount();
    container.remove();
  });

  it("uses a one-column module layout class structure on narrow viewports", async () => {
    const session = makeSession({
      sessionNumber: 1,
      status: "planned",
      title: "First conversation",
    });
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([session])}
        currentSession={session}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );
    expect(
      container.querySelector(".current-conversation-card__modules")
    ).toBeTruthy();
    expect(container.querySelectorAll(".session-module-tile").length).toBe(5);
    expect(container.querySelector(".relationship-workspace")).toBeTruthy();
    root.unmount();
    container.remove();
  });

  it("protects Plan next conversation from repeated clicks while creating", async () => {
    let resolveCreate: (() => void) | undefined;
    const onCreateSession = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveCreate = resolve;
        })
    );

    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([])}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={onCreateSession}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    const planButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Plan next conversation"
    );
    expect(planButton).toBeTruthy();

    await act(async () => {
      planButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const createButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Create conversation"
    );
    expect(createButton).toBeTruthy();
    expect(createButton?.getAttribute("type")).toBe("submit");

    const form = container.querySelector("form.identity-modal");
    expect(form).toBeTruthy();

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onCreateSession).toHaveBeenCalledTimes(1);
    expect(createButton?.textContent).toBe("Creating…");
    expect(createButton?.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      resolveCreate?.();
    });

    root.unmount();
    container.remove();
  });

  it("keeps the empty-state plan action full-width on mobile layouts", async () => {
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([])}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    expect(
      container.querySelector(".current-conversation-card--empty")
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="person-next-conversation"] .add-session-control--prominent'
      )
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="person-next-conversation"] .add-session-control--prominent .identity-button.is-primary'
      )
    ).not.toBeNull();
    root.unmount();
    container.remove();
  });

  it("shows contextual next conversation for planned Session 4 and routes CTAs by id", async () => {
    const session4 = makeSession({
      id: "session-4",
      sessionNumber: 4,
      status: "planned",
      date: "2026-08-30",
      time: "10:00",
    });
    const onPrepareConversation = vi.fn();
    const onRecordConversation = vi.fn();
    const onAddEvidence = vi.fn();
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([
          makeSession({
            id: "session-3",
            sessionNumber: 3,
            status: "completed",
            date: "2026-08-01",
          }),
          session4,
        ])}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onAddEvidence={onAddEvidence}
        onPrepareConversation={onPrepareConversation}
        onRecordConversation={onRecordConversation}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    const strip = container.querySelector(
      '[data-testid="person-next-conversation"]'
    );
    expect(strip?.getAttribute("data-next-session-id")).toBe("session-4");
    expect(strip?.textContent).toContain("Conversation 4");
    expect(strip?.textContent).toContain("30 August 2026");
    expect(strip?.textContent).toContain("Prepare for conversation");

    await act(async () => {
      container
        .querySelector('[data-testid="person-next-primary"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPrepareConversation).toHaveBeenCalledWith("session-4");

    await act(async () => {
      container
        .querySelector('[data-testid="person-next-secondary"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRecordConversation).toHaveBeenCalledWith("session-4");

    await act(async () => {
      container
        .querySelector('[data-testid="person-add-development-evidence"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAddEvidence).toHaveBeenCalledOnce();

    root.unmount();
    container.remove();
  });

  it("shows Review preparation when Session 4 is prepared", async () => {
    const session4 = makeSession({
      id: "session-4",
      sessionNumber: 4,
      status: "prepared",
      date: "2026-08-30",
      time: "10:00",
      prepPurpose: "Enable supervisors",
    });
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([session4])}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    const strip = container.querySelector(
      '[data-testid="person-next-conversation"]'
    );
    expect(strip?.getAttribute("data-next-kind")).toBe("review_preparation");
    expect(strip?.textContent).toContain("Review preparation");
    expect(strip?.textContent).toMatch(/ready to review/i);
    root.unmount();
    container.remove();
  });

  it("shows Continue conversation as primary for in-progress sessions", async () => {
    const live = makeSession({
      id: "session-4",
      sessionNumber: 4,
      status: "in_progress",
      date: "2026-08-30",
      time: "10:00",
    });
    const onRecordConversation = vi.fn();
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([live])}
        currentSession={live}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onRecordConversation={onRecordConversation}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    const strip = container.querySelector(
      '[data-testid="person-next-conversation"]'
    );
    expect(strip?.getAttribute("data-next-kind")).toBe("continue");
    expect(strip?.textContent).toContain("Continue conversation");
    expect(
      container.querySelector('[data-testid="person-next-secondary"]')
    ).toBeNull();

    await act(async () => {
      container
        .querySelector('[data-testid="person-next-primary"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRecordConversation).toHaveBeenCalledWith("session-4");
    root.unmount();
    container.remove();
  });

  it("surfaces plan action when no next session without fabricating a number", async () => {
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([
          makeSession({
            id: "session-3",
            sessionNumber: 3,
            status: "completed",
            date: "2026-08-01",
          }),
        ])}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    const strip = container.querySelector(
      '[data-testid="person-next-conversation"]'
    );
    expect(strip?.getAttribute("data-next-kind")).toBe("plan");
    expect(strip?.getAttribute("data-next-session-id")).toBe("");
    expect(strip?.textContent).toContain("Plan next conversation");
    expect(strip?.textContent).not.toContain("Conversation 4");
    root.unmount();
    container.remove();
  });

  it("keeps next-conversation identity and Prepare destination aligned when awaiting Session 3 and planned Session 4", async () => {
    const session3 = makeSession({
      id: "session-3",
      sessionNumber: 3,
      status: "awaiting_completion",
      date: "2026-08-01",
    });
    const session4 = makeSession({
      id: "session-4",
      sessionNumber: 4,
      status: "planned",
      date: "2026-08-30",
      time: "10:00",
    });
    const onPrepareConversation = vi.fn();
    const { container, root } = await renderNode(
      <RelationshipCanvas
        relationship={makeClient([
          makeSession({
            id: "session-2",
            sessionNumber: 2,
            status: "completed",
            date: "2026-07-15",
          }),
          session3,
          session4,
        ])}
        currentSession={session3}
        relationshipDetails={details}
        onPrimaryAction={() => undefined}
        onModuleAction={() => undefined}
        onOpenSession={() => undefined}
        onPrepareConversation={onPrepareConversation}
        onViewDevelopment={() => undefined}
        onViewReports={() => undefined}
        onCreateSession={async () => undefined}
        onSaveAgreement={async () => undefined}
        onSaveInitialConversation={async () => undefined}
      />
    );

    const strip = container.querySelector(
      '[data-testid="person-next-conversation"]'
    );
    expect(strip?.getAttribute("data-next-session-id")).toBe("session-4");
    expect(strip?.textContent).toContain("Conversation 4");
    expect(strip?.textContent).not.toMatch(/Conversation 3 ·/);

    await act(async () => {
      container
        .querySelector('[data-testid="person-next-primary"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPrepareConversation).toHaveBeenCalledWith("session-4");
    root.unmount();
    container.remove();
  });
});
