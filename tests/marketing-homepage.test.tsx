/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingHomepage } from "@/components/marketing-homepage";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
});

describe("public MarketingHomepage", () => {
  it("renders the Development Snapshot free-trial landing, not the GPT mock", async () => {
    const container = await renderView(<MarketingHomepage />);
    const text = container.textContent || "";

    expect(text).toContain("Start your free trial");
    expect(text).toContain("Free trial");
    expect(text).toContain("14-day free trial. No credit card required.");
    expect(text).toContain("Understand how your managers are developing.");
    expect(text).toContain("Conversations end. Understanding shouldn't.");
    expect(text).toContain("Development snapshot");
    expect(text).toContain("Current position");
    expect(text).toContain("Development strengthening");
    expect(text).toContain("Delegation");
    expect(text).toContain("7 development conversations");

    expect(text).not.toContain("Start free");
    expect(text).not.toContain("Coach-approved");
    expect(text).not.toContain("Supported");
    expect(text).not.toContain("3 conversations");
    expect(text).not.toContain("Strategic thinking");
    expect(text).not.toContain(
      "Important insight should not disappear into old notes."
    );
    expect(text).not.toContain("—");
    expect(text).not.toContain(
      "Manager development and intelligence for organisations"
    );
  });
});
