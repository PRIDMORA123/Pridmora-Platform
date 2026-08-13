/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagerAureliaView } from "@/components/aurelia/manager-aurelia-view";
import { ApiRequestError } from "@/lib/api-failure";

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

describe("Manager Aurelia live chat UI", () => {
  it("sends multi-turn conversation and keeps state in memory only", async () => {
    apiJson
      .mockResolvedValueOnce({ reply: "What outcome would be useful?" })
      .mockResolvedValueOnce({
        reply: "Consider one clear opening sentence.",
      });
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const container = await renderView(
      <ManagerAureliaView onBackHome={() => undefined} />
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    await act(async () => {
      setTextarea(textarea, "I have a difficult conversation tomorrow.");
    });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "I have a difficult conversation tomorrow."
    );
    expect(container.textContent).toContain("What outcome would be useful?");

    expect(apiJson).toHaveBeenNthCalledWith(
      1,
      "/api/my-development/aurelia/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          turns: [],
          message: "I have a difficult conversation tomorrow.",
        }),
      })
    );

    await act(async () => {
      setTextarea(textarea, "They keep interrupting me.");
    });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("They keep interrupting me.");
    expect(container.textContent).toContain(
      "Consider one clear opening sentence."
    );

    const secondInit = apiJson.mock.calls[1]?.[1] as { body: string };
    const secondBody = JSON.parse(secondInit.body) as {
      turns: Array<{ role: string; content: string }>;
      message: string;
    };
    expect(secondBody.turns).toHaveLength(2);
    expect(secondBody.turns[0]?.role).toBe("manager");
    expect(secondBody.turns[1]?.role).toBe("aurelia");
    expect(secondBody.message).toContain("interrupting");
    expect(secondBody).not.toHaveProperty("clientId");

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(
      setItem.mock.calls.some(call =>
        String(call[1] ?? "").includes("difficult conversation")
      )
    ).toBe(false);
  });

  it("restores the draft and shows an error when AI fails", async () => {
    apiJson.mockRejectedValueOnce(
      new ApiRequestError({
        message: "Aurelia is unavailable right now.",
        status: 500,
      })
    );

    const container = await renderView(
      <ManagerAureliaView onBackHome={() => undefined} />
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    await act(async () => {
      setTextarea(textarea, "Help me prepare what to say.");
    });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/unavailable|try again/i);
    expect(textarea.value).toContain("Help me prepare what to say.");
  });

  it("clears local conversation on New conversation", async () => {
    apiJson.mockResolvedValueOnce({ reply: "Tell me more." });

    const container = await renderView(
      <ManagerAureliaView onBackHome={() => undefined} />
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    await act(async () => {
      setTextarea(textarea, "A challenge with my team.");
    });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("A challenge with my team.");

    const buttons = [
      ...container.querySelectorAll("button"),
    ] as HTMLButtonElement[];
    const newConversation = buttons.find(
      button => button.textContent === "New conversation"
    );
    expect(newConversation).toBeTruthy();

    await act(async () => {
      newConversation?.click();
    });

    expect(container.textContent).not.toContain("A challenge with my team.");
    expect(container.textContent).not.toContain("Tell me more.");
    expect(container.textContent).toContain("What’s on your mind?");
  });

  it("keeps Take something forward disabled until there is conversation", async () => {
    const container = await renderView(
      <ManagerAureliaView onBackHome={() => undefined} />
    );
    const takeForward = container.querySelector(
      '[data-testid="manager-aurelia-take-forward"]'
    ) as HTMLButtonElement;
    expect(takeForward.disabled).toBe(true);
  });

  it("opens capture choice and cancels without saving", async () => {
    apiJson.mockResolvedValueOnce({ reply: "What would help most?" });
    const container = await renderView(
      <ManagerAureliaView onBackHome={() => undefined} />
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    await act(async () => {
      setTextarea(textarea, "I keep checking everything.");
    });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });

    const takeForward = container.querySelector(
      '[data-testid="manager-aurelia-take-forward"]'
    ) as HTMLButtonElement;
    expect(takeForward.disabled).toBe(false);

    await act(async () => {
      takeForward.click();
    });
    expect(container.textContent).toContain("Capture a reflection");
    expect(container.textContent).toContain("Create an action");
    expect(container.textContent).not.toContain("Update development focus");

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="manager-aurelia-capture-nothing"]'
        ) as HTMLButtonElement
      ).click();
    });
    expect(container.textContent).toContain("I keep checking everything.");
    expect(apiJson).toHaveBeenCalledTimes(1);
  });
});
