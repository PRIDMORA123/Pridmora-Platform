/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirstUserOnboarding } from "@/components/onboarding/first-user-onboarding";
import { PremiumEmptyHome } from "@/components/onboarding/premium-empty-home";
import { IdentityHomePage } from "@/components/today-view";
import {
  PremiumButton,
  PremiumInlineNotice,
  PremiumInput,
} from "@/components/premium";
import {
  buildFirstUserClientPayload,
  clearFirstUserOnboardingDismiss,
  clearFirstUserOnboardingDraft,
  coachHasCoachingData,
  dismissFirstUserOnboarding,
  firstUserOnboardingDismissKey,
  isFirstUserOnboardingDismissed,
  loadFirstUserOnboardingDraft,
  saveFirstUserOnboardingDraft,
  shouldShowFirstUserOnboarding,
  stripBrowserOrganisationOwnership,
} from "@/lib/first-user-onboarding";
import { pilotClientA, pilotFixtures } from "@/lib/pilot-fixtures";
import type { Client } from "@/lib/types";
import {
  COACHING_JOURNEY_STAGE_IDS,
  STAGE_TO_LEGACY_TAB,
} from "@/lib/coaching-journey/coaching-journey";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function setInputValue(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  );
  proto?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

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

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ awaitingReview: [], recentlyApplied: [], report: null })
    )
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

describe("first-user onboarding trigger rule", () => {
  it("shows only for a genuinely new account with no relationships or sessions", () => {
    expect(
      shouldShowFirstUserOnboarding({ clients: [], dismissed: false })
    ).toBe(true);
    expect(coachHasCoachingData([])).toBe(false);
  });

  it("does not show for existing users with relationships", () => {
    expect(
      shouldShowFirstUserOnboarding({
        clients: [pilotClientA],
        dismissed: false,
      })
    ).toBe(false);
    expect(coachHasCoachingData(pilotFixtures)).toBe(true);
  });

  it("does not show when dismissed unless forceStart is set", () => {
    expect(
      shouldShowFirstUserOnboarding({ clients: [], dismissed: true })
    ).toBe(false);
    expect(
      shouldShowFirstUserOnboarding({
        clients: [],
        dismissed: true,
        forceStart: true,
      })
    ).toBe(true);
  });

  it("ignores archived-only practices as empty for trigger purposes via coachHasCoachingData", () => {
    const archived: Client = { ...pilotClientA, status: "Archived" };
    // Any stored relationship means the account is not a first-time empty workspace.
    expect(coachHasCoachingData([archived])).toBe(true);
    expect(
      shouldShowFirstUserOnboarding({
        clients: [archived],
        dismissed: false,
      })
    ).toBe(false);
  });
});

describe("explore dismisses correctly", () => {
  it("persists dismiss and clears draft", () => {
    const userId = "user-1";
    saveFirstUserOnboardingDraft(window.sessionStorage, userId, {
      step: "relationship",
      relationship: {
        name: "Alex",
        role: "",
        organisation: "",
        coachingFocus: "",
      },
      conversation: {
        plannedDate: "",
        startTime: "",
        conversationFocus: "",
      },
    });
    dismissFirstUserOnboarding(window.localStorage, userId, window.sessionStorage);
    expect(isFirstUserOnboardingDismissed(window.localStorage, userId)).toBe(
      true
    );
    expect(window.localStorage.getItem(firstUserOnboardingDismissKey(userId))).toBe(
      "1"
    );
    expect(loadFirstUserOnboardingDraft(window.sessionStorage, userId)).toBeNull();
    clearFirstUserOnboardingDismiss(window.localStorage, userId);
    expect(isFirstUserOnboardingDismissed(window.localStorage, userId)).toBe(
      false
    );
  });
});

describe("FirstUserOnboarding UI", () => {
  it("renders welcome copy and explore dismisses", async () => {
    const onDismiss = vi.fn();
    const container = await renderView(
      <FirstUserOnboarding
        userId="user-a"
        coachId="coach-a"
        onDismiss={onDismiss}
        onCreateClient={vi.fn()}
        onCreateSession={vi.fn()}
        onPrepare={vi.fn()}
        onViewRelationship={vi.fn()}
      />
    );

    expect(container.textContent).toContain("Welcome to Pridmora");
    expect(container.textContent).toContain(
      "Begin your first coaching relationship."
    );
    expect(container.textContent).toContain("Takes less than a minute.");

    const explore = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Explore the platform first"
    );
    expect(explore).toBeTruthy();
    await act(async () => {
      explore?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("creates relationship via existing APIs without organisation_id from the browser", async () => {
    const onCreateClient = vi.fn(async (fields: Record<string, string>) => {
      expect(fields).not.toHaveProperty("organisationId");
      expect(fields).not.toHaveProperty("organisation_id");
      expect(fields.name).toBe("Jordan Lee");
      expect(fields.email).toBe("");
      return { id: "client-1", name: "Jordan Lee" };
    });
    const onCreateSession = vi.fn(async (input: Record<string, string>) => {
      expect(input).not.toHaveProperty("organisationId");
      expect(input).not.toHaveProperty("organisation_id");
      expect(input.clientId).toBe("client-1");
      expect(input.plannedDate).toBe("");
      expect(input.startTime).toBe("");
      expect(input.conversationFocus).toBe("");
      return { id: "session-1" };
    });
    const onPrepare = vi.fn();

    const container = await renderView(
      <FirstUserOnboarding
        userId="user-b"
        coachId="coach-b"
        initialStep="relationship"
        onDismiss={vi.fn()}
        onCreateClient={onCreateClient}
        onCreateSession={onCreateSession}
        onPrepare={onPrepare}
        onViewRelationship={vi.fn()}
      />
    );

    const nameInput = container.querySelector(
      'input[name="personName"]'
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(nameInput, "Jordan Lee");
    });

    const continueBtn = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Continue"
    );
    await act(async () => {
      continueBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Schedule the first conversation.");
    expect(container.textContent).toContain("Session 1");

    const createBtn = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Create relationship"
    );
    await act(async () => {
      createBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCreateClient).toHaveBeenCalledTimes(1);
    expect(onCreateSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Your first relationship is ready.");

    const prepareBtn = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Prepare for conversation"
    );
    await act(async () => {
      prepareBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPrepare).toHaveBeenCalledWith({
      clientId: "client-1",
      sessionId: "session-1",
      personName: "Jordan Lee",
    });
  });

  it("keeps entered information and shows a safe error when API fails", async () => {
    const onCreateClient = vi.fn(async () => {
      throw new Error("Unable to create the client right now.");
    });

    const container = await renderView(
      <FirstUserOnboarding
        userId="user-c"
        coachId="coach-c"
        initialStep="relationship"
        onDismiss={vi.fn()}
        onCreateClient={onCreateClient}
        onCreateSession={vi.fn()}
        onPrepare={vi.fn()}
        onViewRelationship={vi.fn()}
      />
    );

    const nameInput = container.querySelector(
      'input[name="personName"]'
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(nameInput, "Sam Rivera");
    });

    const continueBtn = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Continue"
    );
    await act(async () => {
      continueBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const createBtn = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Create relationship"
    );
    await act(async () => {
      createBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain(
      "Unable to create the client right now."
    );
    // Draft retained in session storage for safe refresh/retry
    const draft = loadFirstUserOnboardingDraft(window.sessionStorage, "user-c");
    expect(draft?.relationship.name).toBe("Sam Rivera");
    expect(draft?.step).toBe("conversation");
  });

  it("does not create a duplicate client when retrying after a session failure", async () => {
    const onCreateClient = vi.fn(async () => ({
      id: "client-dup",
      name: "Taylor",
    }));
    const onCreateSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("Conversation create failed."))
      .mockResolvedValueOnce({ id: "session-dup" });

    const container = await renderView(
      <FirstUserOnboarding
        userId="user-d"
        coachId="coach-d"
        initialStep="relationship"
        onDismiss={vi.fn()}
        onCreateClient={onCreateClient}
        onCreateSession={onCreateSession}
        onPrepare={vi.fn()}
        onViewRelationship={vi.fn()}
      />
    );

    const nameInput = container.querySelector(
      'input[name="personName"]'
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(nameInput, "Taylor");
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find(button => button.textContent === "Continue")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const createBtn = () =>
      Array.from(container.querySelectorAll("button")).find(
        button =>
          button.textContent === "Create relationship" ||
          button.textContent === "Creating relationship…"
      );

    await act(async () => {
      createBtn()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCreateClient).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Conversation create failed.");

    await act(async () => {
      createBtn()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCreateClient).toHaveBeenCalledTimes(1);
    expect(onCreateSession).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Your first relationship is ready.");
  });

  it("restores mid-onboarding draft after refresh", async () => {
    saveFirstUserOnboardingDraft(window.sessionStorage, "user-e", {
      step: "conversation",
      relationship: {
        name: "Casey",
        role: "Director",
        organisation: "Acme",
        coachingFocus: "Presence",
      },
      conversation: {
        plannedDate: "2026-09-01",
        startTime: "10:00",
        conversationFocus: "Kick-off",
      },
    });

    const container = await renderView(
      <FirstUserOnboarding
        userId="user-e"
        coachId="coach-e"
        onDismiss={vi.fn()}
        onCreateClient={vi.fn()}
        onCreateSession={vi.fn()}
        onPrepare={vi.fn()}
        onViewRelationship={vi.fn()}
      />
    );

    expect(container.textContent).toContain("Schedule the first conversation.");
    const dateInput = container.querySelector(
      'input[name="plannedDate"]'
    ) as HTMLInputElement;
    expect(dateInput.value).toBe("2026-09-01");
  });
});

describe("payload helpers", () => {
  it("builds client payload without organisation ownership fields", () => {
    const payload = buildFirstUserClientPayload({
      name: "Alex",
      role: "VP",
      organisation: "Northwind",
      coachingFocus: "Leadership",
    });
    expect(payload).toEqual({
      name: "Alex",
      role: "VP",
      organisation: "Northwind",
      currentFocus: "Leadership",
      email: "",
    });
    expect(payload).not.toHaveProperty("organisationId");
    expect(payload).not.toHaveProperty("organisation_id");
  });

  it("strips organisation_id from browser session bodies", () => {
    const safe = stripBrowserOrganisationOwnership({
      clientId: "c1",
      organisationId: "should-not-send",
      organisation_id: "also-no",
      focus: "Optional",
    });
    expect(safe).toEqual({ clientId: "c1", focus: "Optional" });
  });
});

describe("premium empty Home", () => {
  it("renders focused empty state without fake analytics", async () => {
    const onCreate = vi.fn();
    const container = await renderView(
      <PremiumEmptyHome onCreateRelationship={onCreate} />
    );
    expect(container.textContent).toContain("Your workspace");
    expect(container.textContent).toContain(
      "Start with one meaningful conversation."
    );
    expect(container.textContent).toContain("Prepare with AI");
    expect(container.textContent).toContain("Capture the conversation");
    expect(container.textContent).toContain("Reveal development");
    expect(container.textContent).not.toContain("Active relationships");
    expect(container.textContent).not.toContain("Awaiting preparation");

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find(button => button.textContent === "Create your first relationship")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe("IdentityHomePage onboarding gating", () => {
  it("does not show onboarding for a populated practice", async () => {
    const container = await renderView(
      <IdentityHomePage
        clients={[pilotClientA]}
        coachName="Barry"
        userId="existing-user"
        coachId="existing-user"
        onOpenClient={vi.fn()}
        onPrepare={vi.fn()}
        onCreateClientForOnboarding={vi.fn()}
        onCreateSessionForOnboarding={vi.fn()}
      />
    );
    expect(container.textContent).not.toContain(
      "Begin your first coaching relationship."
    );
    expect(container.textContent).not.toContain("Get started");
  });

  it("shows welcome for an empty undismissed account", async () => {
    const container = await renderView(
      <IdentityHomePage
        clients={[]}
        coachName="Barry"
        userId="new-user"
        coachId="new-user"
        onOpenClient={vi.fn()}
        onPrepare={vi.fn()}
        onCreateClientForOnboarding={vi.fn(async () => ({
          id: "x",
          name: "x",
        }))}
        onCreateSessionForOnboarding={vi.fn(async () => ({ id: "y" }))}
      />
    );
    expect(container.textContent).toContain(
      "Begin your first coaching relationship."
    );
  });
});

describe("core workflow sequence remains unchanged", () => {
  it("keeps Prepare → Conversation → Summary & Insights → Development order", () => {
    expect(COACHING_JOURNEY_STAGE_IDS).toEqual([
      "current_position",
      "prepare",
      "session_notes",
      "summary_insights",
      "development",
      "reports",
    ]);
    expect(STAGE_TO_LEGACY_TAB.prepare).toBe("prepare");
    expect(STAGE_TO_LEGACY_TAB.session_notes).toBe("sessions");
    expect(STAGE_TO_LEGACY_TAB.summary_insights).toBe("summary");
    expect(STAGE_TO_LEGACY_TAB.development).toBe("intelligence");
  });
});

describe("shared premium components accessibility", () => {
  it("PremiumInput associates labels and announces errors", async () => {
    const container = await renderView(
      <PremiumInput
        label="Person’s name"
        name="personName"
        value=""
        onChange={() => undefined}
        error="Person’s name is required."
      />
    );
    const input = container.querySelector("input");
    const label = container.querySelector("label");
    expect(label?.getAttribute("for")).toBe(input?.id);
    expect(container.querySelector("[role='alert']")?.textContent).toContain(
      "Person’s name is required."
    );
  });

  it("PremiumInlineNotice uses alert role for errors", async () => {
    const container = await renderView(
      <PremiumInlineNotice tone="error">Something went wrong.</PremiumInlineNotice>
    );
    const notice = container.querySelector("[role='alert']");
    expect(notice?.textContent).toContain("Something went wrong.");
    expect(notice?.getAttribute("aria-live")).toBe("assertive");
  });

  it("PremiumButton remains a native focusable button", async () => {
    const container = await renderView(
      <PremiumButton variant="primary">Continue</PremiumButton>
    );
    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Continue");
    expect(button?.className).toContain("identity-button");
  });
});

describe("draft cleanup helper", () => {
  it("clears draft storage", () => {
    saveFirstUserOnboardingDraft(window.sessionStorage, "z", {
      step: "welcome",
      relationship: {
        name: "",
        role: "",
        organisation: "",
        coachingFocus: "",
      },
      conversation: {
        plannedDate: "",
        startTime: "",
        conversationFocus: "",
      },
    });
    clearFirstUserOnboardingDraft(window.sessionStorage, "z");
    expect(loadFirstUserOnboardingDraft(window.sessionStorage, "z")).toBeNull();
  });
});
