/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { AddSessionControl } from "@/components/relationship-workspace/add-session-control";
import { CREATE_CONVERSATION_USER_ERROR } from "@/lib/organisations/session-organisation";

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

describe("AddSessionControl create conversation modal", () => {
  it("shows the person’s name and Session 1", async () => {
    const { container, root } = await renderNode(
      <AddSessionControl
        sessions={[]}
        clientName="Alex Example"
        showProminent
        onCreate={async () => undefined}
      />
    );

    const openButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent?.includes("Plan next conversation")
    );
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain(
      "Create conversation for Alex Example"
    );
    expect(container.textContent).toContain("Session 1");
    expect(container.textContent).toContain("Planned date");
    expect(container.textContent).toContain("Start time");
    expect(container.textContent).toContain("Reason or focus");

    root.unmount();
    container.remove();
  });

  it("does not show raw database constraint errors", async () => {
    const onCreate = vi.fn().mockRejectedValue(
      new Error(
        'null value in column "organisation_id" of relation "sessions" violates not-null constraint'
      )
    );

    const { container, root } = await renderNode(
      <AddSessionControl
        sessions={[]}
        clientName="Alex Example"
        showProminent
        onCreate={onCreate}
      />
    );

    const openButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent?.includes("Plan next conversation")
    );
    await act(async () => {
      openButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const createButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent?.trim() === "Create conversation"
    );
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const alert = container.querySelector(".inline-error");
    expect(alert?.textContent).toBe(CREATE_CONVERSATION_USER_ERROR);
    expect(container.textContent).not.toMatch(/violates not-null/i);
    expect(alert?.textContent).not.toMatch(/organisation_id/i);

    root.unmount();
    container.remove();
  });
});
