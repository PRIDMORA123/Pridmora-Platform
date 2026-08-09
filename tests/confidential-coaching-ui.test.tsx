/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NewClientDialog,
  type NewClientFormValues,
} from "@/components/new-client-dialog";
import { ClientIdentityHeader } from "@/components/identity/client-header";
import { ClientActionsMenu } from "@/components/client-actions-menu";
import { PrivateIdentityAccess } from "@/components/private-identity/private-identity-access";
import { ApiRequestError } from "@/lib/api-failure";
import {
  mapPrivateIdentityLoadError,
  PRIVATE_IDENTITY_ACCESS_DENIED,
  PRIVATE_IDENTITY_LOAD_FAILED,
  PRIVATE_IDENTITY_MISSING,
  privateIdentityVisibleFields,
} from "@/lib/private-identity-ui";
import type { Client } from "@/lib/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const apiJson = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiJson: (...args: unknown[]) => apiJson(...args),
}));

function baseClient(partial: Partial<Client> & Pick<Client, "id" | "name">): Client {
  return {
    initials: "XX",
    organisation: "North Harbour Trust",
    role: "Head of Finance",
    email: "",
    identityMode: "standard",
    displayLabel: partial.name,
    confidentialReference: null,
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
    ...partial,
  };
}

function confidentialClient(): Client {
  return baseClient({
    id: "22222222-2222-4222-8222-222222222222",
    name: "Head of Finance programme",
    identityMode: "confidential",
    displayLabel: "Head of Finance programme",
    confidentialReference: "C-7K4M2P",
    aiNameAllowed: false,
  });
}

function standardClient(): Client {
  return baseClient({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Alex Morgan",
    identityMode: "standard",
    displayLabel: "Alex Morgan",
    email: "alex@example.com",
  });
}

function noopLifecycle() {
  return {
    onEdit: () => undefined,
    onArchive: async () => undefined,
    onRestore: async () => undefined,
    onPermanentlyDelete: async () => undefined,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("confidential coaching UI", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    apiJson.mockReset();
    apiJson.mockResolvedValue({
      privateIdentity: {
        realName: "Hidden Person",
        email: "hidden@example.com",
        phone: "",
        privateNotes: "",
      },
    });
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.querySelectorAll(".identity-drawer-layer, .client-actions-popover").forEach(node => {
      node.remove();
    });
  });

  function render(node: ReactNode) {
    act(() => {
      root.render(node);
    });
  }

  function bodyText() {
    return `${container.textContent || ""}${document.body.textContent || ""}`;
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
    expect(container.textContent).toMatch(
      /Recommended for sensitive development work/i
    );
    expect(container.textContent).toMatch(/Confidential mode/i);
  });

  it("Manager People NewClientDialog shows vault real name immediately on Confidential", async () => {
    // Live path: home-app People / topbar "New person" → NewClientDialog (not a separate Manager form).
    const onCreate = vi.fn(async (_fields: NewClientFormValues) => undefined);
    render(
      <NewClientDialog open onClose={() => undefined} onCreate={onCreate} />
    );

    const confidentialRadio = container.querySelector(
      'input[value="confidential"]'
    ) as HTMLInputElement;

    act(() => {
      confidentialRadio.click();
    });

    const privateName = container.querySelector(
      "#new-client-private-name"
    ) as HTMLInputElement | null;
    const displayLabel = container.querySelector(
      "#new-client-display-label"
    ) as HTMLInputElement | null;
    expect(privateName).toBeTruthy();
    expect(displayLabel).toBeTruthy();
    expect(container.querySelector("#new-client-name")).toBeNull();
    expect(container.textContent).toMatch(
      /Real name — stored privately in Identity Vault/
    );
    expect(container.textContent).toMatch(/Safe display label \/ alias/);

    // Vault field must appear before the safe alias in the DOM (immediately visible).
    const body = container.querySelector(".identity-modal__body");
    const html = body?.innerHTML || "";
    expect(html.indexOf("new-client-private-name")).toBeLessThan(
      html.indexOf("new-client-display-label")
    );

    const createButton = Array.from(
      container.querySelectorAll("button")
    ).find(button =>
      /Create relationship/i.test(button.textContent || "")
    ) as HTMLButtonElement | undefined;
    expect(createButton).toBeTruthy();

    // Alias alone — submit blocked.
    act(() => {
      setInputValue(displayLabel!, "Programme lead");
    });
    expect(createButton?.disabled).toBe(true);
    expect(onCreate).not.toHaveBeenCalled();

    // With vault real name — submit succeeds; payload keeps public alias separate.
    act(() => {
      setInputValue(privateName!, "Jordan Vault");
    });
    expect(createButton?.disabled).toBe(false);

    await act(async () => {
      createButton!.click();
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
    const payload = onCreate.mock.calls[0][0];
    expect(payload.identityMode).toBe("confidential");
    expect(payload.privateRealName).toBe("Jordan Vault");
    expect(payload.displayLabel).toBe("Programme lead");
    expect(payload.name).toBe("");
    expect(payload.displayLabel).not.toBe(payload.privateRealName);
  });

  it("keeps confidential workspace header anonymous without private identity entry", () => {
    render(<ClientIdentityHeader client={confidentialClient()} />);

    expect(container.textContent).toMatch(/Confidential relationship/);
    expect(container.textContent).toContain("C-7K4M2P");
    expect(container.querySelector("h1")?.textContent).toBe(
      "Head of Finance programme"
    );
    expect(container.textContent).not.toContain("Hidden Person");
    expect(container.textContent).not.toMatch(/View private identity/);
  });

  it("shows View private identity only for confidential relationships", () => {
    render(<ClientActionsMenu client={confidentialClient()} {...noopLifecycle()} />);

    act(() => {
      (
        container.querySelector(
          'button[aria-label="Client actions"], button[aria-label="Person actions"], button[aria-label="Team member actions"]'
        ) as HTMLButtonElement
      ).click();
    });

    expect(bodyText()).toMatch(/View private identity/);
  });

  it("does not show View private identity for standard relationships", () => {
    render(<ClientActionsMenu client={standardClient()} {...noopLifecycle()} />);

    act(() => {
      (
        container.querySelector(
          'button[aria-label="Client actions"], button[aria-label="Person actions"], button[aria-label="Team member actions"]'
        ) as HTMLButtonElement
      ).click();
    });

    expect(bodyText()).not.toMatch(/View private identity/);
  });

  it("shows confirmation before fetching private identity", async () => {
    render(<ClientActionsMenu client={confidentialClient()} {...noopLifecycle()} />);

    act(() => {
      (
        container.querySelector(
          'button[aria-label="Client actions"], button[aria-label="Person actions"], button[aria-label="Team member actions"]'
        ) as HTMLButtonElement
      ).click();
    });

    const menuItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
      item => /View private identity/i.test(item.textContent || "")
    ) as HTMLButtonElement;

    act(() => {
      menuItem.click();
    });

    expect(bodyText()).toMatch(/This information is protected/);
    expect(bodyText()).toMatch(/Access is recorded for audit purposes/);
    expect(apiJson).not.toHaveBeenCalled();
    expect(bodyText()).not.toContain("Hidden Person");
  });

  it("reveals private fields only after deliberate confirmation", async () => {
    render(<ClientActionsMenu client={confidentialClient()} {...noopLifecycle()} />);

    act(() => {
      (
        container.querySelector(
          'button[aria-label="Client actions"], button[aria-label="Person actions"], button[aria-label="Team member actions"]'
        ) as HTMLButtonElement
      ).click();
    });

    act(() => {
      (
        Array.from(document.querySelectorAll('[role="menuitem"]')).find(item =>
          /View private identity/i.test(item.textContent || "")
        ) as HTMLButtonElement
      ).click();
    });

    await act(async () => {
      (
        Array.from(document.querySelectorAll("button")).find(item =>
          /^View identity$/i.test(item.textContent || "")
        ) as HTMLButtonElement
      ).click();
    });

    expect(apiJson).toHaveBeenCalledWith(
      expect.stringContaining("/private-identity"),
      expect.objectContaining({ method: "GET" })
    );
    expect(bodyText()).toContain("Hidden Person");
    expect(bodyText()).toContain("hidden@example.com");
    expect(bodyText()).toContain("C-7K4M2P");
    expect(bodyText()).toMatch(/Edit private identity/);
  });

  it("omits empty private fields from the panel", async () => {
    apiJson.mockResolvedValueOnce({
      privateIdentity: {
        realName: "Hidden Person",
        email: "",
        phone: "",
        privateNotes: "",
      },
    });

    render(
      <PrivateIdentityAccess
        clientId={confidentialClient().id}
        confidentialReference="C-7K4M2P"
        open
        onOpenChange={() => undefined}
      />
    );

    await act(async () => {
      (
        Array.from(document.querySelectorAll("button")).find(item =>
          /^View identity$/i.test(item.textContent || "")
        ) as HTMLButtonElement
      ).click();
    });

    expect(bodyText()).toContain("Name");
    expect(bodyText()).toContain("Hidden Person");
    expect(bodyText()).not.toMatch(/\bEmail\b/);
    expect(bodyText()).not.toMatch(/\bPhone\b/);
    expect(bodyText()).not.toMatch(/Private note/);
  });

  it("clears private data on close and does not persist storage", async () => {
    let open = true;
    const onOpenChange = (next: boolean) => {
      open = next;
      render(
        <PrivateIdentityAccess
          clientId={confidentialClient().id}
          confidentialReference="C-7K4M2P"
          open={open}
          onOpenChange={onOpenChange}
        />
      );
    };

    render(
      <PrivateIdentityAccess
        clientId={confidentialClient().id}
        confidentialReference="C-7K4M2P"
        open
        onOpenChange={onOpenChange}
      />
    );

    await act(async () => {
      (
        Array.from(document.querySelectorAll("button")).find(item =>
          /^View identity$/i.test(item.textContent || "")
        ) as HTMLButtonElement
      ).click();
    });

    expect(bodyText()).toContain("Hidden Person");

    await act(async () => {
      (
        Array.from(document.querySelectorAll("button")).find(
          item => item.textContent === "Close" && item.getAttribute("aria-label") !== "Close"
        ) as HTMLButtonElement
      )?.click();
      // Footer Close
      const closes = Array.from(document.querySelectorAll("button")).filter(
        item => item.textContent === "Close"
      );
      closes[closes.length - 1]?.click();
    });

    expect(bodyText()).not.toContain("Hidden Person");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(JSON.stringify(localStorage)).not.toContain("Hidden Person");
    expect(JSON.stringify(sessionStorage)).not.toContain("Hidden Person");
  });

  it("clears private data when navigating to another relationship", async () => {
    const firstId = confidentialClient().id;
    const secondId = "33333333-3333-4333-8333-333333333333";

    render(
      <PrivateIdentityAccess
        clientId={firstId}
        confidentialReference="C-7K4M2P"
        open
        onOpenChange={() => undefined}
      />
    );

    await act(async () => {
      (
        Array.from(document.querySelectorAll("button")).find(item =>
          /^View identity$/i.test(item.textContent || "")
        ) as HTMLButtonElement
      ).click();
    });

    expect(bodyText()).toContain("Hidden Person");

    await act(async () => {
      root.render(
        <PrivateIdentityAccess
          clientId={secondId}
          confidentialReference="C-9X8Y7Z"
          open={false}
          onOpenChange={() => undefined}
        />
      );
    });

    expect(bodyText()).not.toContain("Hidden Person");
  });

  it("shows a safe access denied message without fetching private values into errors", async () => {
    apiJson.mockRejectedValueOnce(
      new ApiRequestError({
        message: "Permission denied.",
        status: 403,
      })
    );

    render(
      <PrivateIdentityAccess
        clientId={confidentialClient().id}
        confidentialReference="C-7K4M2P"
        open
        onOpenChange={() => undefined}
      />
    );

    await act(async () => {
      (
        Array.from(document.querySelectorAll("button")).find(item =>
          /^View identity$/i.test(item.textContent || "")
        ) as HTMLButtonElement
      ).click();
    });

    expect(bodyText()).toContain(PRIVATE_IDENTITY_ACCESS_DENIED);
    expect(bodyText()).not.toContain("Permission denied");
    expect(bodyText()).not.toContain("Hidden Person");
  });

  it("uses the secure private identity route for edit saves", async () => {
    apiJson
      .mockResolvedValueOnce({
        privateIdentity: {
          realName: "Hidden Person",
          email: "hidden@example.com",
          phone: "",
          privateNotes: "",
        },
      })
      .mockResolvedValueOnce({
        privateIdentity: {
          realName: "Hidden Person",
          email: "hidden@example.com",
          phone: "01234",
          privateNotes: "",
        },
      });

    render(
      <PrivateIdentityAccess
        clientId={confidentialClient().id}
        confidentialReference="C-7K4M2P"
        open
        onOpenChange={() => undefined}
      />
    );

    await act(async () => {
      (
        Array.from(document.querySelectorAll("button")).find(item =>
          /^View identity$/i.test(item.textContent || "")
        ) as HTMLButtonElement
      ).click();
    });

    await act(async () => {
      (
        Array.from(document.querySelectorAll("button")).find(item =>
          /Edit private identity/i.test(item.textContent || "")
        ) as HTMLButtonElement
      ).click();
    });

    await act(async () => {
      (
        Array.from(document.querySelectorAll("button")).find(item =>
          /^Save$/i.test(item.textContent || "")
        ) as HTMLButtonElement
      ).click();
    });

    expect(apiJson).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/api\/clients\/.+\/private-identity$/),
      expect.objectContaining({ method: "PUT" })
    );
  });
});

describe("private identity helpers and source guards", () => {
  it("maps load errors to safe messages", () => {
    expect(
      mapPrivateIdentityLoadError(
        new ApiRequestError({ message: "Permission denied.", status: 403 })
      )
    ).toBe(PRIVATE_IDENTITY_ACCESS_DENIED);
    expect(
      mapPrivateIdentityLoadError(
        new ApiRequestError({ message: "Resource not found.", status: 404 })
      )
    ).toBe(PRIVATE_IDENTITY_ACCESS_DENIED);
    expect(mapPrivateIdentityLoadError(new Error("relation does not exist"))).toBe(
      PRIVATE_IDENTITY_LOAD_FAILED
    );
  });

  it("omits empty fields and keeps confidential reference", () => {
    expect(
      privateIdentityVisibleFields(
        {
          realName: "Hidden Person",
          email: "",
          phone: " ",
          privateNotes: "",
        },
        "C-7K4M2P"
      )
    ).toEqual([
      { label: "Confidential reference", value: "C-7K4M2P" },
      { label: "Name", value: "Hidden Person" },
    ]);
    expect(PRIVATE_IDENTITY_MISSING).toMatch(/No private identity details/);
  });

  it("audits successful views only and never logs private values", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/clients/[clientId]/private-identity/route.ts"),
      "utf8"
    );
    const privateLib = readFileSync(
      join(process.cwd(), "lib/private-identity.ts"),
      "utf8"
    );
    const ui = readFileSync(
      join(process.cwd(), "components/private-identity/private-identity-access.tsx"),
      "utf8"
    );
    const menu = readFileSync(
      join(process.cwd(), "components/client-actions-menu.tsx"),
      "utf8"
    );
    const header = readFileSync(
      join(process.cwd(), "components/identity/client-header.tsx"),
      "utf8"
    );

    expect(route).toContain("auditPrivateIdentityViewed");
    expect(route).toContain("if (record && organisationId)");
    expect(privateLib).toContain('action: "private_identity_viewed"');
    expect(privateLib).toContain("// Never log identity values.");
    const viewedBlock = privateLib.slice(
      privateLib.indexOf("auditPrivateIdentityViewed"),
      privateLib.indexOf("searchPrivateIdentityClientIds")
    );
    expect(viewedBlock).not.toContain("real_name");
    expect(viewedBlock).not.toContain("private_notes");
    expect(ui).toContain('operation: "private_identity_view"');
    expect(ui).toContain('operation: "private_identity_update"');
    expect(ui).not.toContain("localStorage");
    expect(ui).not.toContain("sessionStorage");
    expect(menu).toContain("View private identity");
    expect(menu).toContain('client.identityMode === "confidential"');
    expect(header).not.toContain("View private identity");
    expect(header).not.toContain("private-identity");
  });
});
