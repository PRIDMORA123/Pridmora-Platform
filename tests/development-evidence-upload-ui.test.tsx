/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevelopmentEvidenceView } from "@/components/development-evidence/development-evidence-view";
import type { Client } from "@/lib/types";

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

function baseClient(): Client {
  return {
    id: "d3082253-71db-4fd5-a68b-a82d5069a70b",
    name: "Kate Pridmore",
    initials: "KP",
    organisation: "BSH",
    role: "Self development",
    email: "",
    identityMode: "standard",
    displayLabel: "My development",
    confidentialReference: null,
    aiNameAllowed: false,
    status: "Active",
    nextSession: "Not scheduled",
    currentFocus: "Personal development record",
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
    isSelfDevelopment: true,
  };
}

function setInputValue(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("DevelopmentEvidenceView Analyse upload", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    apiJson.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    apiJson.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/development-evidence/") && !String(url).includes("/item/")) {
        return {
          items: [],
          confidence: {
            level: "low",
            label: "Low",
            basis: "Limited approved evidence.",
            independentSourceCount: 0,
            factors: {
              independentSources: 0,
              recentSources: 0,
              repeatedBehaviours: 0,
              consistencyScore: 0,
              humanValidated: false,
              contradictionCount: 0,
              specificityScore: 0,
              relevanceScore: 0,
            },
          },
          coverage: {
            level: "narrow",
            label: "Narrow",
            represented: [],
            representedLabels: [],
            notRepresented: [],
            notRepresentedLabels: [],
            summary: "No approved evidence yet.",
          },
          uploadableTypes: [
            { value: "feedback_360", label: "360 feedback" },
            { value: "other_document", label: "Other document" },
          ],
        };
      }
      if (String(url).includes("/analyse")) {
        return { ok: true };
      }
      if (String(url).includes("/item/")) {
        return {
          evidence: {
            id: "ev-1",
            title: "notes.txt",
            reviewStatus: "pending_review",
          },
          observations: [
            {
              id: "obs-1",
              title: "Observation",
              description: "Detail",
              reviewStatus: "proposed",
            },
          ],
          document: { id: "doc-1", fileName: "notes.txt", hasExtractedText: true },
        };
      }
      return {};
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  function render(node: ReactNode) {
    act(() => {
      root.render(node);
    });
  }

  async function openWizardToPurpose(file: File) {
    render(
      <DevelopmentEvidenceView
        client={baseClient()}
        onBack={() => undefined}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const addButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Add evidence"
    );
    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const typeSelect = container.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      setInputValue(typeSelect, "feedback_360");
    });

    const continueType = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Continue"
    );
    await act(async () => {
      continueType?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        configurable: true,
        value: {
          0: file,
          length: 1,
          item: () => file,
        },
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const continueUpload = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Continue"
    );
    await act(async () => {
      continueUpload?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const purpose = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(purpose, "Support development planning");
    });
  }

  it("Analyse sends multipart upload with file, type, title and purpose", async () => {
    const file = new File(["hello evidence"], "notes.txt", {
      type: "text/plain",
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        evidence: { id: "ev-1", title: "notes.txt" },
      }),
    });

    await openWizardToPurpose(file);

    const analyse = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Analyse"
    ) as HTMLButtonElement;

    await act(async () => {
      analyse.click();
    });

    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/development-evidence/${baseClient().id}/upload`
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("file")).toBeInstanceOf(File);
    expect((form.get("file") as File).name).toBe("notes.txt");
    expect(form.get("evidenceType")).toBe("feedback_360");
    expect(form.get("title")).toBe("notes.txt");
    expect(form.get("purpose")).toBe("Support development planning");
  });

  it("success clears loading and reaches review", async () => {
    const file = new File(["hello evidence"], "notes.txt", {
      type: "text/plain",
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        evidence: { id: "ev-1", title: "notes.txt" },
      }),
    });

    await openWizardToPurpose(file);

    const analyse = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Analyse"
    ) as HTMLButtonElement;

    await act(async () => {
      analyse.click();
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/Review extracted evidence|Include all/);
    expect(container.textContent).not.toMatch(/Working…|Uploading evidence/);
  });

  it("failed upload clears loading and surfaces error", async () => {
    const file = new File(["hello evidence"], "notes.txt", {
      type: "text/plain",
    });

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Unable to upload evidence." }),
    });

    await openWizardToPurpose(file);

    const analyse = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Analyse"
    ) as HTMLButtonElement;

    await act(async () => {
      analyse.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Unable to upload evidence.");
    expect(container.textContent).not.toMatch(/Uploading…/);
    expect(container.textContent).toContain("Confirm purpose");
    expect(container.textContent).toContain("Analyse");
  });

  it("keeps uploaded evidence and offers retry when AI analysis fails", async () => {
    const file = new File(["hello evidence"], "notes.txt", {
      type: "text/plain",
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        evidence: { id: "ev-1", title: "notes.txt" },
      }),
    });
    apiJson.mockImplementation(async (url: string) => {
      if (String(url).includes("/analyse")) {
        throw new Error("Analysis timed out. Your uploaded evidence was saved.");
      }
      if (String(url).includes("/api/development-evidence/") && !String(url).includes("/item/")) {
        return {
          items: [],
          confidence: {
            level: "low",
            label: "Low",
            basis: "Limited approved evidence.",
            independentSourceCount: 0,
            factors: {
              independentSources: 0,
              recentSources: 0,
              repeatedBehaviours: 0,
              consistencyScore: 0,
              humanValidated: false,
              contradictionCount: 0,
              specificityScore: 0,
              relevanceScore: 0,
            },
          },
          coverage: {
            level: "narrow",
            label: "Narrow",
            represented: [],
            representedLabels: [],
            notRepresented: [],
            notRepresentedLabels: [],
            summary: "No approved evidence yet.",
          },
          uploadableTypes: [
            { value: "feedback_360", label: "360 feedback" },
          ],
        };
      }
      return {};
    });

    await openWizardToPurpose(file);
    const analyse = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Analyse"
    ) as HTMLButtonElement;

    await act(async () => {
      analyse.click();
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/uploaded evidence was saved|Retry analysis/i);
    const retry = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Retry analysis"
    ) as HTMLButtonElement;
    expect(retry).toBeTruthy();

    apiJson.mockImplementation(async (url: string) => {
      if (String(url).includes("/analyse")) return { ok: true };
      if (String(url).includes("/item/")) {
        return {
          evidence: { id: "ev-1", title: "notes.txt", reviewStatus: "pending_review" },
          observations: [
            {
              id: "obs-1",
              title: "Observation",
              description: "Detail",
              reviewStatus: "proposed",
            },
          ],
          document: { id: "doc-1", fileName: "notes.txt", hasExtractedText: true },
        };
      }
      return {
        items: [],
        confidence: {
          level: "low",
          label: "Low",
          basis: "Limited",
          independentSourceCount: 0,
          factors: {
            independentSources: 0,
            recentSources: 0,
            repeatedBehaviours: 0,
            consistencyScore: 0,
            humanValidated: false,
            contradictionCount: 0,
            specificityScore: 0,
            relevanceScore: 0,
          },
        },
        coverage: {
          level: "narrow",
          label: "Narrow",
          represented: [],
          representedLabels: [],
          notRepresented: [],
          notRepresentedLabels: [],
          summary: "None",
        },
        uploadableTypes: [],
      };
    });

    await act(async () => {
      retry.click();
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/Review extracted evidence|Include all/);
  });

  it("blocks duplicate Analyse submissions while busy", async () => {
    const file = new File(["hello evidence"], "notes.txt", {
      type: "text/plain",
    });

    let resolveUpload: ((value: unknown) => void) | null = null;
    fetchMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpload = resolve;
        })
    );

    await openWizardToPurpose(file);

    const analyse = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Analyse"
    ) as HTMLButtonElement;

    await act(async () => {
      analyse.click();
      analyse.click();
      analyse.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/Aurelia is working|Reviewing evidence/);

    await act(async () => {
      resolveUpload?.({
        ok: true,
        status: 201,
        json: async () => ({ evidence: { id: "ev-1", title: "notes.txt" } }),
      });
      await Promise.resolve();
    });
  });

  it("keeps purpose step during upload and only then moves to analyse", async () => {
    const file = new File(["hello evidence"], "notes.txt", {
      type: "text/plain",
    });
    let resolveUpload: ((value: unknown) => void) | null = null;
    fetchMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpload = resolve;
        })
    );

    await openWizardToPurpose(file);
    const analyse = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Analyse"
    ) as HTMLButtonElement;

    await act(async () => {
      analyse.click();
    });

    expect(container.textContent).toContain("Why is this being added? (required)");
    expect(container.textContent).toMatch(/Aurelia is working|Reviewing evidence/);
    expect(container.textContent).not.toMatch(/Retry analysis/);

    await act(async () => {
      resolveUpload?.({
        ok: false,
        status: 500,
        json: async () => ({ error: "Unable to upload evidence." }),
      });
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Unable to upload evidence.");
    expect(container.textContent).toContain("Why is this being added? (required)");
  });

  it("does not surface technical storage-path errors to the manager", async () => {
    const file = new File(["hello evidence"], "notes.txt", {
      type: "text/plain",
    });

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: "Invalid development evidence storage path.",
      }),
    });

    await openWizardToPurpose(file);

    const analyse = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Analyse"
    ) as HTMLButtonElement;

    await act(async () => {
      analyse.click();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain(
      "Invalid development evidence storage path."
    );
    expect(container.textContent).toContain(
      "Unable to store this evidence file. Try again, or upload a PDF, DOCX or plain-text file."
    );
  });
});
