/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { ActionsWorkspace } from "@/components/actions/actions-workspace";
import { SessionNextSteps } from "@/components/actions/session-next-steps";
import { createBlankSession } from "@/lib/sessions";
import { OrganisationProvider } from "@/lib/organisations/organisation-context";
import type { OrganisationWorkspaceState } from "@/lib/organisations/organisation-context";
import type { ProfessionalRole } from "@/lib/organisations/types";
import type { Session } from "@/lib/types";

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

function withOrg(node: ReactNode) {
  return (
    <OrganisationProvider initial={makeOrgState("coach")}>
      {node}
    </OrganisationProvider>
  );
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    ...createBlankSession({
      id: "session-5",
      clientId: "client-alex",
      coachId: "coach-1",
      sessionNumber: 5,
      status: "awaiting_completion",
    }),
    summaryStatus: "approved",
    aiSummaryApproved: true,
    commitments: "",
    agreedActions: "",
    ...overrides,
  };
}

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(withOrg(node));
  });
  return {
    container,
    root,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

const PERSON_EMPTY_TITLE = "No open commitments";
const PERSON_EMPTY_DESCRIPTION =
  "Agreed actions will appear here when they are created.";
const SESSION_EMPTY_TITLE = "No commitments from this conversation";
const SESSION_EMPTY_DESCRIPTION =
  "No new commitments were recorded in this conversation.";

describe("Session Actions conversation-scoped empty state (render)", () => {
  it("renders conversation-scoped empty copy via SessionNextSteps", async () => {
    const { container, cleanup } = await renderNode(
      <SessionNextSteps
        clientName="Alex Morgan"
        clientId="client-alex"
        session={makeSession()}
        actions={[]}
        priorOpenCommitmentCount={0}
        hideStageHeader
        onSaveAction={async action => action}
      />
    );

    const text = container.textContent || "";
    expect(text).toContain(SESSION_EMPTY_TITLE);
    expect(text).toContain(SESSION_EMPTY_DESCRIPTION);
    expect(text).not.toContain(PERSON_EMPTY_TITLE);
    expect(text).not.toContain(PERSON_EMPTY_DESCRIPTION);
    cleanup();
  });

  it("shows prior-open secondary hint when earlier opens exist", async () => {
    const { container, cleanup } = await renderNode(
      <SessionNextSteps
        clientName="Alex Morgan"
        clientId="client-alex"
        session={makeSession()}
        actions={[]}
        priorOpenCommitmentCount={1}
        hideStageHeader
        onSaveAction={async action => action}
      />
    );

    const text = container.textContent || "";
    expect(text).toContain(SESSION_EMPTY_TITLE);
    expect(text).toContain(
      "1 commitment remains open from an earlier conversation."
    );
    expect(text).not.toContain(PERSON_EMPTY_TITLE);
    expect(text).not.toContain(PERSON_EMPTY_DESCRIPTION);
    cleanup();
  });

  it("uses conversation-scoped empty when embedded even without sessionScoped", async () => {
    const { container, cleanup } = await renderNode(
      <ActionsWorkspace
        clientName="Alex Morgan"
        clientId="client-alex"
        sessionId="session-5"
        actions={[]}
        embedded
        priorOpenCommitmentCount={2}
        onSaveAction={async action => action}
      />
    );

    const text = container.textContent || "";
    expect(text).toContain(SESSION_EMPTY_TITLE);
    expect(text).toContain(SESSION_EMPTY_DESCRIPTION);
    expect(text).toContain(
      "2 commitments remain open from earlier conversations."
    );
    expect(text).not.toContain(PERSON_EMPTY_TITLE);
    expect(text).not.toContain(PERSON_EMPTY_DESCRIPTION);
    cleanup();
  });

  it("keeps person-level empty copy when ActionsWorkspace is not embedded", async () => {
    const { container, cleanup } = await renderNode(
      <ActionsWorkspace
        clientName="Alex Morgan"
        clientId="client-alex"
        sessionId="session-5"
        actions={[]}
        onSaveAction={async action => action}
      />
    );

    const text = container.textContent || "";
    expect(text).toContain(PERSON_EMPTY_TITLE);
    expect(text).toContain(PERSON_EMPTY_DESCRIPTION);
    expect(text).not.toContain(SESSION_EMPTY_TITLE);
    expect(text).not.toContain(SESSION_EMPTY_DESCRIPTION);
    cleanup();
  });
});
