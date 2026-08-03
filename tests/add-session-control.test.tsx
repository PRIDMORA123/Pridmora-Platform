/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { AddSessionControl } from "@/components/relationship-workspace/add-session-control";
import { CREATE_CONVERSATION_USER_ERROR } from "@/lib/organisations/session-organisation";
import { createSessionRecord } from "@/lib/storage";
import { createBlankSession } from "@/lib/sessions";

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

async function openCreateDialog(container: HTMLElement) {
  const openButton = Array.from(container.querySelectorAll("button")).find(
    button => button.textContent?.includes("Plan next conversation")
  );
  expect(openButton).toBeTruthy();
  await act(async () => {
    openButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return container.querySelector("form.identity-modal") as HTMLFormElement;
}

async function submitCreateForm(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  });
}

describe("AddSessionControl create conversation submit contract", () => {
  it("shows the person’s name and Session 1", async () => {
    const { container, root } = await renderNode(
      <AddSessionControl
        sessions={[]}
        clientName="Alex Example"
        clientId="client-1"
        showProminent
        onCreate={async () => undefined}
      />
    );

    await openCreateDialog(container);

    expect(container.textContent).toContain(
      "Create conversation for Alex Example"
    );
    expect(container.textContent).toContain("Session 1");
    expect(container.textContent).toContain("Planned date");
    expect(container.textContent).toContain("Start time");
    expect(container.textContent).toContain("Reason or focus");

    const form = container.querySelector("form.identity-modal");
    const submit = form?.querySelector('button[type="submit"]');
    const cancel = Array.from(form?.querySelectorAll("button") ?? []).find(
      button => button.textContent?.trim() === "Cancel"
    );
    expect(form).toBeTruthy();
    expect(submit?.getAttribute("type")).toBe("submit");
    expect(cancel?.getAttribute("type")).toBe("button");
    expect(form?.contains(submit as Node)).toBe(true);

    root.unmount();
    container.remove();
  });

  it("invokes the submit handler and closes on success", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { container, root } = await renderNode(
      <AddSessionControl
        sessions={[]}
        clientName="Alex Example"
        clientId="client-1"
        showProminent
        onCreate={onCreate}
      />
    );

    const form = await openCreateDialog(container);
    await submitCreateForm(form);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith({
      title: "",
      plannedDate: "",
      startTime: "",
      focus: "",
    });
    expect(container.querySelector("form.identity-modal")).toBeNull();

    root.unmount();
    container.remove();
  });

  it("submits with optional blank date/time/focus", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { container, root } = await renderNode(
      <AddSessionControl
        sessions={[]}
        clientId="client-1"
        showProminent
        onCreate={onCreate}
      />
    );

    const form = await openCreateDialog(container);
    await submitCreateForm(form);

    expect(onCreate).toHaveBeenCalledWith({
      title: "",
      plannedDate: "",
      startTime: "",
      focus: "",
    });

    root.unmount();
    container.remove();
  });

  it("keeps the modal open and shows a safe error on failure", async () => {
    const onCreate = vi.fn().mockRejectedValue(
      new Error(
        'null value in column "organisation_id" of relation "sessions" violates not-null constraint'
      )
    );

    const { container, root } = await renderNode(
      <AddSessionControl
        sessions={[]}
        clientName="Alex Example"
        clientId="client-1"
        showProminent
        onCreate={onCreate}
      />
    );

    const form = await openCreateDialog(container);
    await submitCreateForm(form);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(container.querySelector("form.identity-modal")).toBeTruthy();
    const alert = container.querySelector(".identity-modal-error");
    expect(alert?.textContent).toBe(CREATE_CONVERSATION_USER_ERROR);
    expect(container.textContent).not.toMatch(/violates not-null/i);

    root.unmount();
    container.remove();
  });

  it("does not create two requests on double submit", async () => {
    let resolveCreate: (() => void) | undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveCreate = resolve;
        })
    );

    const { container, root } = await renderNode(
      <AddSessionControl
        sessions={[]}
        clientId="client-1"
        showProminent
        onCreate={onCreate}
      />
    );

    const form = await openCreateDialog(container);
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
    const submit = form.querySelector('button[type="submit"]');
    expect(submit?.textContent).toBe("Creating…");
    expect(submit?.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      resolveCreate?.();
    });

    root.unmount();
    container.remove();
  });

  it("does not submit when Cancel is pressed", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { container, root } = await renderNode(
      <AddSessionControl
        sessions={[]}
        clientId="client-1"
        showProminent
        onCreate={onCreate}
      />
    );

    const form = await openCreateDialog(container);
    const cancel = Array.from(form.querySelectorAll("button")).find(
      button => button.textContent?.trim() === "Cancel"
    );
    await act(async () => {
      cancel?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCreate).not.toHaveBeenCalled();
    expect(container.querySelector("form.identity-modal")).toBeNull();

    root.unmount();
    container.remove();
  });

  it("shows a visible error when relationship context is missing", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { container, root } = await renderNode(
      <AddSessionControl
        sessions={[]}
        clientName="Alex Example"
        showProminent
        onCreate={onCreate}
      />
    );

    const form = await openCreateDialog(container);
    await submitCreateForm(form);

    expect(onCreate).not.toHaveBeenCalled();
    expect(container.querySelector("form.identity-modal")).toBeTruthy();
    expect(container.querySelector(".identity-modal-error")?.textContent).toMatch(
      /missing required context/i
    );

    root.unmount();
    container.remove();
  });
});

describe("createSessionRecord request shape", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => "application/json" },
      json: async () => ({
        session: createBlankSession({
          id: "11111111-1111-4111-8111-111111111111",
          clientId: "22222222-2222-4222-8222-222222222222",
          coachId: "33333333-3333-4333-8333-333333333333",
          sessionNumber: 1,
        }),
      }),
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs /api/sessions once with clientId and without organisation_id", async () => {
    vi.spyOn(
      await import("@/lib/auth/browser"),
      "requireBrowserAuth"
    ).mockResolvedValue({ id: "coach-1" } as never);

    const session = createBlankSession({
      id: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      coachId: "33333333-3333-4333-8333-333333333333",
      sessionNumber: 1,
    });

    await createSessionRecord({
      ...session,
      organisationId: "browser-org",
      organisation_id: "browser-org-snake",
    } as typeof session & {
      organisationId: string;
      organisation_id: string;
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as {
      session: Record<string, unknown>;
    };
    expect(body.session.clientId).toBe(
      "22222222-2222-4222-8222-222222222222"
    );
    expect(body.session).not.toHaveProperty("organisationId");
    expect(body.session).not.toHaveProperty("organisation_id");
  });
});
