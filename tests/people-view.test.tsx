/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { ClientsView } from "@/components/clients-view";
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
    status: "Active",
    createdAt: "2026-01-01T00:00:00.000Z",
    nextSession: "",
    currentFocus:
      overrides.currentFocus ??
      "To build confidence and capability as a new operational leader by strengthening delegation, accountability, strategic thinking and leadership presence.",
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
  return { container, root };
}

describe("ClientsView visual polish", () => {
  it("retains only the empty-state add action — no page-level New person button", async () => {
    const onAdd = vi.fn();
    const { container, root } = await renderNode(
      <ClientsView
        clients={[
          makeClient({
            id: "c1",
            name: "Daniel Roberts",
            sessions: [makeSession({ clientId: "c1", status: "planned" })],
          }),
        ]}
        onOpen={() => undefined}
        onAdd={onAdd}
      />
    );

    const labels = Array.from(container.querySelectorAll("button")).map(
      button => button.textContent?.replace(/\s+/g, " ").trim()
    );
    expect(labels.some(label => label === "New person")).toBe(false);
    expect(container.textContent).toContain(
      "Team members and people you support — ordered by what needs attention next."
    );
    root.unmount();
    container.remove();
  });

  it("orders rows by attention and uses complete-word focus previews", async () => {
    const clients = [
      makeClient({
        id: "quiet",
        name: "Zoe Quiet",
        sessions: [makeSession({ clientId: "quiet", status: "planned" })],
      }),
      makeClient({
        id: "live",
        name: "Daniel Roberts",
        sessions: [makeSession({ clientId: "live", status: "in_progress" })],
      }),
      makeClient({
        id: "ready",
        name: "Mia Ready",
        sessions: [makeSession({ clientId: "ready", status: "prepared" })],
      }),
    ];

    const { container, root } = await renderNode(
      <ClientsView clients={clients} onOpen={() => undefined} onAdd={() => undefined} />
    );

    const names = Array.from(
      container.querySelectorAll(".identity-person-row__name")
    ).map(node => node.textContent);

    expect(names).toEqual(["Daniel Roberts", "Mia Ready", "Zoe Quiet"]);
    expect(container.textContent).toContain("Continue conversation");
    expect(container.textContent).toContain("Prepare conversation");

    const focus = container.querySelector(".identity-person-row__focus p");
    expect(focus?.textContent || "").not.toMatch(/\w…\w/);
    expect(focus?.textContent || "").not.toMatch(/i…$/);
    expect(container.querySelector(".identity-person-row")).toBeTruthy();

    root.unmount();
    container.remove();
  });

  it("keeps a compact mobile-friendly row structure", async () => {
    const { container, root } = await renderNode(
      <ClientsView
        clients={[makeClient({ name: "Daniel Roberts", sessions: [] })]}
        onOpen={() => undefined}
        onAdd={() => undefined}
      />
    );

    const row = container.querySelector(".identity-person-row");
    expect(row?.querySelector(".identity-person-row__name")?.textContent).toBe(
      "Daniel Roberts"
    );
    expect(row?.querySelector(".identity-person-row__journey")).toBeTruthy();
    expect(row?.querySelector(".identity-person-row__focus")).toBeTruthy();
    expect(row?.querySelector(".identity-person-row__next")?.textContent).toContain(
      "Plan next conversation"
    );

    root.unmount();
    container.remove();
  });
});
