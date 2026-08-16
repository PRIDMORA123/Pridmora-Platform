/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ManagerCommandCentre } from "@/components/identity/manager-command-centre";
import { ManagerAureliaView } from "@/components/aurelia/manager-aurelia-view";
import { buildManagerHomeAttentionItems } from "@/lib/people/manager-home-attention";
import {
  getPeopleAttentionRank,
  getPeopleNextActionLabel,
} from "@/lib/people/attention-order";
import { createBlankSession } from "@/lib/sessions";
import type { Client, Session } from "@/lib/types";

function makeSession(
  overrides: Partial<Session> & { sessionNumber?: number } = {}
): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: overrides.clientId ?? "client-1",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status ?? "planned",
    }),
    ...overrides,
  };
}

function makeClient(
  overrides: Partial<Client> & { sessions?: Session[] } = {}
): Client {
  return {
    id: overrides.id ?? "client-1",
    name: overrides.name ?? "Alex Example",
    initials: "AE",
    organisation: "Example Org",
    role: "Manager",
    email: "",
    status: overrides.status ?? "Active",
    createdAt: "2026-01-01T00:00:00.000Z",
    nextSession: "",
    currentFocus: overrides.currentFocus ?? "Build confidence",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: overrides.sessions ?? [],
    journey: [],
    ...overrides,
  };
}

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

describe("Gate 2 manager operating experience", () => {
  it("builds Needs attention items from existing People attention ranks", () => {
    const active = makeClient({
      id: "c-active",
      name: "Mia Active",
      sessions: [makeSession({ clientId: "c-active", status: "in_progress" })],
    });
    const quiet = makeClient({
      id: "c-quiet",
      name: "Quiet Person",
      sessions: [],
    });
    const items = buildManagerHomeAttentionItems([quiet, active]);
    expect(items).toHaveLength(1);
    expect(items[0]?.personName).toBe("Mia Active");
    expect(items[0]?.nextActionLabel).toBe("Continue conversation");
  });

  it("returns zero attention items when nothing actionable is waiting", () => {
    const quiet = makeClient({ sessions: [] });
    expect(buildManagerHomeAttentionItems([quiet])).toEqual([]);
  });

  it("renders Needs attention and self-evidence wording on Manager Home", async () => {
    const person = makeClient({
      id: "c-1",
      name: "Sam Team",
      sessions: [makeSession({ clientId: "c-1", status: "prepared" })],
    });
    const { container, cleanup } = await renderNode(
      <ManagerCommandCentre
        greeting="Good evening"
        coachName="Barry"
        clients={[person]}
        hasManagedPeople
        onTalkThrough={() => undefined}
        onPrepareSomething={() => undefined}
        onReflect={() => undefined}
        onOpenMyDevelopment={() => undefined}
        onOpenPeople={() => undefined}
        onAddEvidence={() => undefined}
        onOpenPerson={() => undefined}
      />
    );

    const text = container.textContent || "";
    expect(text).toContain("Needs attention");
    expect(text).toContain("Who or what needs your attention?");
    expect(text).toContain("Sam Team");
    expect(text).toContain("Start conversation");
    expect(text).toContain("What would help you today?");
    expect(text).toContain("Add my development evidence");
    expect(text).toContain("your own development record");
    expect(
      container.querySelector('[data-front-door-action="add-evidence"]')
        ?.textContent
    ).toContain("Add my development evidence");
    cleanup();
  });

  it("shows a clear zero-attention empty state when people exist but none need action", async () => {
    const quiet = makeClient({ name: "Quiet Person", sessions: [] });
    const { container, cleanup } = await renderNode(
      <ManagerCommandCentre
        greeting="Good evening"
        coachName="Barry"
        clients={[quiet]}
        hasManagedPeople
        onTalkThrough={() => undefined}
        onPrepareSomething={() => undefined}
        onReflect={() => undefined}
        onOpenMyDevelopment={() => undefined}
        onOpenPeople={() => undefined}
        onAddEvidence={() => undefined}
      />
    );

    expect(
      container.querySelector('[data-testid="manager-needs-attention-empty"]')
        ?.textContent
    ).toContain("Nothing needs your attention right now.");
    cleanup();
  });

  it("surfaces Capture development moment on the person workspace", () => {
    const canvas = readFileSync(
      resolve("components/relationship-workspace/relationship-canvas.tsx"),
      "utf8"
    );
    expect(canvas).toContain("Capture development moment");
    expect(canvas).toContain("person-capture-development-moment");
    expect(canvas).toContain("onNewCoachingMoment");
  });

  it("uses Plan next conversation and ranks preparation above plan-next", () => {
    expect(getPeopleNextActionLabel(makeClient({ sessions: [] }))).toBe(
      "Plan next conversation"
    );
    expect(
      getPeopleAttentionRank(
        makeClient({ sessions: [makeSession({ status: "planned" })] })
      )
    ).toBe(5);
    expect(getPeopleAttentionRank(makeClient({ sessions: [] }))).toBe(6);
  });

  it("discloses that Manager Aurelia chat is not saved and capture is deliberate", async () => {
    const { container, cleanup } = await renderNode(
      <ManagerAureliaView onBackHome={() => undefined} />
    );
    const text = container.textContent || "";
    expect(text).toMatch(/conversation itself is not saved/i);
    expect(text).toContain("Take something forward");
    expect(text).toMatch(/your own development/i);
    cleanup();
  });

  it("keeps generic Aurelia APIs person-free", () => {
    const chat = readFileSync(
      resolve("app/api/my-development/aurelia/chat/route.ts"),
      "utf8"
    );
    const capture = readFileSync(
      resolve("app/api/my-development/aurelia/capture-action/route.ts"),
      "utf8"
    );
    expect(chat).toContain("rejectPersonIdentifiers");
    expect(capture).toContain("rejectPersonIdentifiers");
  });
});
