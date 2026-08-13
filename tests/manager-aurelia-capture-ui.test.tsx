/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagerAureliaView } from "@/components/aurelia/manager-aurelia-view";

const apiJson = vi.fn();

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>(
    "@/lib/api-client"
  );
  return {
    ...actual,
    apiJson: (...args: unknown[]) => apiJson(...args),
  };
});

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

async function renderView(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  mounted.push({ root, container });
  return container;
}

function setTextarea(textarea: HTMLTextAreaElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  );
  proto?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

async function sendFirstMessage(container: HTMLDivElement, message: string) {
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    setTextarea(textarea, message);
  });
  await act(async () => {
    container.querySelector("form")?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  apiJson.mockReset();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true)
  );
});

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
  vi.unstubAllGlobals();
});

describe("Manager Aurelia capture UI", () => {
  it("proposes an editable reflection and saves only after confirm", async () => {
    apiJson
      .mockResolvedValueOnce({ reply: "What experiment would help?" })
      .mockResolvedValueOnce({
        captureType: "reflection",
        draft: {
          title: "Checking less",
          whatNoticed: "I intervene too early.",
          practiseNext: "Use one checkpoint.",
        },
      })
      .mockResolvedValueOnce({ evidenceId: "ev-1", workspace: {} });

    const container = await renderView(
      <ManagerAureliaView onBackHome={() => undefined} />
    );
    await sendFirstMessage(container, "I keep checking my team.");

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-take-forward"]'
        ) as HTMLButtonElement
      ).click();
    });
    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-capture-choose-reflection"]'
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Saving this reflection adds it to your My Development record"
    );
    expect(container.textContent).toContain("without naming colleagues");

    const noticed = Array.from(
      container.querySelectorAll("textarea")
    ).find(node => (node as HTMLTextAreaElement).value.includes("intervene")) as
      | HTMLTextAreaElement
      | undefined;
    expect(noticed).toBeTruthy();
    await act(async () => {
      setTextarea(noticed!, "Edited notice before save.");
    });

    expect(apiJson).toHaveBeenCalledTimes(2);

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-capture-confirm-reflection"]'
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });

    expect(apiJson).toHaveBeenCalledTimes(3);
    const saveCall = apiJson.mock.calls[2];
    expect(String(saveCall[0])).toContain("/api/my-development/reflection");
    expect(JSON.parse(String(saveCall[1].body))).toMatchObject({
      whatNoticed: "Edited notice before save.",
    });
    expect(container.textContent).toContain(
      "Reflection saved to your My Development record."
    );
    expect(container.textContent).toContain("I keep checking my team.");
  });

  it("proposes an action and saves through the Aurelia capture-action path", async () => {
    apiJson
      .mockResolvedValueOnce({ reply: "What one step would help?" })
      .mockResolvedValueOnce({
        captureType: "action",
        draft: { title: "Delegate one operational task" },
      })
      .mockResolvedValueOnce({
        action: { id: "a1", title: "Delegate one operational task", status: "Open" },
      });

    const container = await renderView(
      <ManagerAureliaView onBackHome={() => undefined} />
    );
    await sendFirstMessage(container, "I need a clear next step.");

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-take-forward"]'
        ) as HTMLButtonElement
      ).click();
    });
    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-capture-choose-action"]'
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-capture-confirm-action"]'
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });

    const saveCall = apiJson.mock.calls[2];
    expect(String(saveCall[0])).toContain(
      "/api/my-development/aurelia/capture-action"
    );
    expect(JSON.parse(String(saveCall[1].body))).toEqual({
      title: "Delegate one operational task",
    });
    expect(container.textContent).toContain(
      "Action saved to your My Development record."
    );
  });

  it("keeps chat intact and creates no save when proposal fails", async () => {
    apiJson
      .mockResolvedValueOnce({ reply: "Tell me more." })
      .mockRejectedValueOnce(new Error("proposal failed"));

    const container = await renderView(
      <ManagerAureliaView onBackHome={() => undefined} />
    );
    await sendFirstMessage(container, "A hard conversation is coming.");

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-take-forward"]'
        ) as HTMLButtonElement
      ).click();
    });
    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-capture-choose-reflection"]'
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("A hard conversation is coming.");
    expect(container.textContent).toContain(
      "Aurelia couldn't prepare a draft just now. Nothing has been saved. Please try again."
    );
    expect(container.textContent).not.toContain("OpenAI");
    expect(apiJson).toHaveBeenCalledTimes(2);
  });

  it("shows no success when save fails and retains the draft", async () => {
    apiJson
      .mockResolvedValueOnce({ reply: "What matters most?" })
      .mockResolvedValueOnce({
        captureType: "action",
        draft: { title: "Prepare the quality conversation" },
      })
      .mockRejectedValueOnce(new Error("save failed"));

    const container = await renderView(
      <ManagerAureliaView onBackHome={() => undefined} />
    );
    await sendFirstMessage(container, "I need to address quality tomorrow.");

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-take-forward"]'
        ) as HTMLButtonElement
      ).click();
    });
    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-capture-choose-action"]'
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });
    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-capture-confirm-action"]'
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain(
      "Action saved to your My Development record."
    );
    expect(container.textContent).toContain("save failed");
    expect(
      (
        container.querySelector(
          '[data-testid="manager-aurelia-capture-action-title"]'
        ) as HTMLInputElement
      ).value
    ).toBe("Prepare the quality conversation");
  });
});
