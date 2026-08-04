/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewClientDialog } from "@/components/new-client-dialog";
import { ClientIdentityHeader } from "@/components/identity/client-header";
import type { Client } from "@/lib/types";

vi.mock("@/lib/api-client", () => ({
  apiJson: vi.fn(async () => ({
    privateIdentity: {
      realName: "Hidden Person",
      email: "hidden@example.com",
      phone: "",
      privateNotes: "",
    },
  })),
}));

function confidentialClient(): Client {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Head of Finance programme",
    initials: "HF",
    organisation: "North Harbour Trust",
    role: "Head of Finance",
    email: "",
    identityMode: "confidential",
    displayLabel: "Head of Finance programme",
    confidentialReference: "C-7K4M2P",
    aiNameAllowed: false,
    status: "Active",
    nextSession: "Not scheduled",
    currentFocus: "Stakeholder conversations",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: [],
    journey: [],
  };
}

describe("confidential coaching UI", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function render(node: ReactNode) {
    act(() => {
      root.render(node);
    });
  }

  it("presents identity mode choice with confidential recommended", () => {
    render(
      <NewClientDialog
        open
        onClose={() => undefined}
        onCreate={async () => undefined}
      />
    );

    expect(container.textContent).toMatch(/How would you like to manage identity/);
    expect(container.textContent).toMatch(/Recommended for sensitive coaching/i);
    expect(container.textContent).toMatch(/Confidential coaching/i);
  });

  it("switches to confidential fields without requiring a real name", () => {
    render(
      <NewClientDialog
        open
        onClose={() => undefined}
        onCreate={async () => undefined}
      />
    );

    const confidentialRadio = container.querySelector(
      'input[value="confidential"]'
    ) as HTMLInputElement;
    expect(confidentialRadio).toBeTruthy();

    act(() => {
      confidentialRadio.click();
    });

    expect(container.querySelector("#new-client-display-label")).toBeTruthy();
    expect(container.querySelector("#new-client-role-confidential")).toBeTruthy();
    expect(container.querySelector("#new-client-name")).toBeNull();
    expect(container.textContent).toMatch(/Add private identity details/);
  });

  it("shows confidential header without revealing private name by default", () => {
    render(<ClientIdentityHeader client={confidentialClient()} />);

    expect(container.textContent).toMatch(/Confidential relationship/);
    expect(container.textContent).toContain("C-7K4M2P");
    expect(container.querySelector("h1")?.textContent).toBe(
      "Head of Finance programme"
    );
    expect(container.textContent).not.toContain("Hidden Person");
    expect(container.textContent).toMatch(/View private identity/);
  });

  it("reveals private identity only after deliberate click", async () => {
    render(<ClientIdentityHeader client={confidentialClient()} />);

    const button = Array.from(container.querySelectorAll("button")).find(
      item => /View private identity/i.test(item.textContent || "")
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(container.textContent).toContain("Hidden Person");
    expect(container.textContent).toContain("hidden@example.com");
  });
});
