/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRAND, getProductTitle } from "@/lib/brand";
import { IdentityProductMark } from "@/components/identity/product-mark";
import { AuthShell } from "@/components/auth/auth-shell";
import { IdentityIntelligencePanel } from "@/components/identity-intelligence/identity-intelligence-panel";

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

describe("Pridmora Development Platform branding", () => {
  it("exposes canonical brand configuration", () => {
    expect(BRAND.productName).toBe("Pridmora Development Platform");
    expect(BRAND.productShortName).toBe("Development Platform");
    expect(BRAND.productDescriptor).toBe(
      "Manager development and intelligence for organisations"
    );
    expect(BRAND.intelligenceName).toBe("Aurelia");
    expect(BRAND.intelligenceRole).toBe(
      "Manager Development Intelligence Assistant"
    );
    expect(BRAND.legalCompanyName).toBe("Pridmora Ltd");
    expect(BRAND.journeyName).toBe("Development Journey");
  });

  it("builds browser titles from the product name", () => {
    expect(getProductTitle()).toBe(BRAND.productName);
    expect(getProductTitle("Sign in")).toBe(
      `Sign in | ${BRAND.productName}`
    );
  });

  it("renders the authenticated short wordmark", async () => {
    const container = await renderView(<IdentityProductMark />);
    expect(container.textContent).toContain("Pridmora");
    expect(container.textContent).toContain("Development Platform");
    expect(container.textContent).not.toContain("Identity");
    expect(
      container.querySelector(".product-brand")?.getAttribute("aria-label")
    ).toBe(BRAND.productName);
  });

  it("login shell shows product name and editorial brand copy", async () => {
    const container = await renderView(
      <AuthShell eyebrow="WELCOME BACK" title="Welcome back">
        <form />
      </AuthShell>
    );
    expect(container.textContent).toContain(BRAND.companyName);
    expect(container.textContent).toContain(BRAND.productShortName);
    expect(container.textContent).toContain("Welcome back");
    expect(container.textContent).toContain("into evidence.");
    expect(container.querySelector(".auth-layout")).toBeTruthy();
    expect(container.querySelector(".login-card")).toBeNull();
    expect(container.textContent).not.toContain("Identity Intelligence");
    expect(container.textContent).not.toMatch(/\bIdentity by Pridmora\b/);
  });

  it("marketing homepage uses the new product name", async () => {
    const { MarketingHomepage } = await import(
      "@/components/marketing-homepage"
    );
    const container = await renderView(<MarketingHomepage />);
    expect(container.textContent).toContain(BRAND.productName);
    expect(container.textContent).toContain(BRAND.productDescriptor);
    expect(container.textContent).not.toContain("Identity by Pridmora");
  });

  it("shows Aurelia on AI surfaces", async () => {
    const container = await renderView(
      <IdentityIntelligencePanel level="insight">
        <p>Sample insight</p>
      </IdentityIntelligencePanel>
    );
    expect(container.textContent).toContain("Aurelia");
    expect(container.textContent).not.toContain("Identity Intelligence");
  });

  it("keeps professional identity as a coaching concept in system prompt", () => {
    const prompt = readFileSync(
      resolve(process.cwd(), "lib/ai/identity-system-prompt.ts"),
      "utf8"
    );
    expect(prompt).toContain("professional identity");
    expect(prompt).toContain("Pridmora Development Platform");
    expect(prompt).not.toMatch(/within Identity,/);
  });

  it("layout metadata uses the new product name", () => {
    const layout = readFileSync(
      resolve(process.cwd(), "app/layout.tsx"),
      "utf8"
    );
    expect(layout).toContain("brandMetadata");
    expect(layout).not.toContain("Identity by Pridmora");
  });

  it("report preview and PDF use the new brand", () => {
    const preview = readFileSync(
      resolve(process.cwd(), "components/reports/development-report-preview.tsx"),
      "utf8"
    );
    const pdf = readFileSync(
      resolve(process.cwd(), "components/coaching-report-pdf.tsx"),
      "utf8"
    );
    expect(preview).toContain("BRAND.productName");
    expect(preview).not.toContain("Identity™");
    expect(pdf).toContain("BRAND.intelligenceName");
    expect(pdf).not.toContain("IDENTITY™");
  });

  it("organisation invitation copy references the product name", () => {
    const accept = readFileSync(
      resolve(
        process.cwd(),
        "app/organisation/invitations/accept/page.tsx"
      ),
      "utf8"
    );
    const modal = readFileSync(
      resolve(process.cwd(), "components/organisation/invite-member-modal.tsx"),
      "utf8"
    );
    expect(accept).toContain("BRAND.productName");
    expect(modal).toContain("BRAND.productName");
  });

  it("journey UI uses Development Journey", () => {
    const journey = readFileSync(
      resolve(process.cwd(), "components/journey-view.tsx"),
      "utf8"
    );
    const intelligence = readFileSync(
      resolve(process.cwd(), "components/intelligence-view.tsx"),
      "utf8"
    );
    expect(journey).toContain("DEVELOPMENT JOURNEY");
    expect(journey).toContain("DEVELOPMENT EVOLUTION TIMELINE");
    expect(journey).not.toContain("PROFESSIONAL IDENTITY JOURNEY");
    expect(journey).not.toContain("IDENTITY EVOLUTION TIMELINE");
    expect(intelligence).toContain("Open Development Journey");
    expect(intelligence).not.toContain("Professional Identity Journey");
  });

  it("AI actor copy uses Aurelia via BRAND.intelligenceName", () => {
    const modeConfig = readFileSync(
      resolve(process.cwd(), "lib/coaching-intelligence/mode-config.ts"),
      "utf8"
    );
    const preparation = readFileSync(
      resolve(process.cwd(), "lib/preparation-workspace.ts"),
      "utf8"
    );
    const coachingJourney = readFileSync(
      resolve(process.cwd(), "lib/coaching-journey/coaching-journey.ts"),
      "utf8"
    );
    const reportView = readFileSync(
      resolve(process.cwd(), "components/coaching-report-view.tsx"),
      "utf8"
    );
    expect(modeConfig).toContain("BRAND.intelligenceName");
    expect(modeConfig).not.toMatch(/"Identity (will|reviews)/);
    expect(preparation).toContain("BRAND.intelligenceName");
    expect(preparation).not.toMatch(/"Identity brings/);
    expect(coachingJourney).toContain("BRAND.intelligenceName");
    expect(coachingJourney).not.toMatch(/what Identity has organised/);
    expect(reportView).toContain("BRAND.journeyName");
    expect(reportView).not.toContain("Professional Identity Journey");
  });
});
