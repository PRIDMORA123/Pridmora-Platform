/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api-client", () => ({
  apiJson: vi.fn(async () => ({
    workspace: {
      focusItems: [],
      actions: [],
      reflections: [],
      maturity: { totalEvidenceCount: 0, isEmpty: true },
    },
  })),
}));

import { ManagerCommandCentre } from "@/components/identity/manager-command-centre";

describe("Stage 3.2A Manager Home / Prepare UI", () => {
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

  it("shows Prepare guidance when the Manager has no People", async () => {
    const onTalkThrough = vi.fn();
    const onPrepareSomething = vi.fn();
    const onOpenMyDevelopment = vi.fn();
    const onOpenPeople = vi.fn();
    const onReflect = vi.fn();
    const onAddEvidence = vi.fn();

    await act(async () => {
      root.render(
        <ManagerCommandCentre
          greeting="Good morning"
          coachName="Sam"
          hasManagedPeople={false}
          onTalkThrough={onTalkThrough}
          onPrepareSomething={onPrepareSomething}
          onReflect={onReflect}
          onOpenMyDevelopment={onOpenMyDevelopment}
          onOpenPeople={onOpenPeople}
          onAddEvidence={onAddEvidence}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("What would help you today?");
    expect(container.textContent).toContain("Talk something through");
    expect(container.textContent).not.toContain("coaching support");
    expect(container.textContent).not.toContain("Identity Vault");

    await act(async () => {
      (
        container.querySelector(
          '[data-front-door-action="prepare"]'
        ) as HTMLButtonElement
      ).click();
    });

    expect(onPrepareSomething).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Person-specific preparation needs someone in My People"
    );
    expect(container.textContent).toContain("nothing is created automatically");

    await act(async () => {
      (
        Array.from(container.querySelectorAll("button")).find(button =>
          /Talk something through/i.test(button.textContent || "")
        ) as HTMLButtonElement
      ).click();
    });
    expect(onTalkThrough).toHaveBeenCalled();
  });

  it("routes Prepare normally when managed People exist", async () => {
    const onPrepareSomething = vi.fn();

    await act(async () => {
      root.render(
        <ManagerCommandCentre
          greeting="Good morning"
          coachName="Sam"
          hasManagedPeople
          onTalkThrough={() => undefined}
          onPrepareSomething={onPrepareSomething}
          onReflect={() => undefined}
          onOpenMyDevelopment={() => undefined}
          onOpenPeople={() => undefined}
          onAddEvidence={() => undefined}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      (
        container.querySelector(
          '[data-front-door-action="prepare"]'
        ) as HTMLButtonElement
      ).click();
    });

    expect(onPrepareSomething).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain(
      "Person-specific preparation needs someone in My People"
    );
  });
});
