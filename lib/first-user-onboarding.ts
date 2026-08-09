import type { Client } from "@/lib/types";
import { isClientArchived } from "@/lib/types";

/** First-user onboarding steps (welcome → relationship → conversation → done). */
export type FirstUserOnboardingStep =
  | "welcome"
  | "relationship"
  | "conversation"
  | "complete";

export type FirstUserRelationshipDraft = {
  identityMode: "standard" | "confidential";
  name: string;
  displayLabel: string;
  /** Identity Vault real name — required in confidential mode; never public. */
  privateRealName: string;
  role: string;
  organisation: string;
  coachingFocus: string;
};

export type FirstUserConversationDraft = {
  plannedDate: string;
  startTime: string;
  conversationFocus: string;
};

export type FirstUserOnboardingDraft = {
  step: FirstUserOnboardingStep;
  relationship: FirstUserRelationshipDraft;
  conversation: FirstUserConversationDraft;
  /** Set after a successful client create when session create still pending. */
  createdClientId?: string;
  createdSessionId?: string;
};

export const EMPTY_RELATIONSHIP_DRAFT: FirstUserRelationshipDraft = {
  identityMode: "standard",
  name: "",
  displayLabel: "",
  privateRealName: "",
  role: "",
  organisation: "",
  coachingFocus: "",
};

export const EMPTY_CONVERSATION_DRAFT: FirstUserConversationDraft = {
  plannedDate: "",
  startTime: "",
  conversationFocus: "",
};

export const EMPTY_ONBOARDING_DRAFT: FirstUserOnboardingDraft = {
  step: "welcome",
  relationship: { ...EMPTY_RELATIONSHIP_DRAFT },
  conversation: { ...EMPTY_CONVERSATION_DRAFT },
};

const DISMISS_PREFIX = "pridmora.first-user-onboarding.dismissed:";
const DRAFT_PREFIX = "pridmora.first-user-onboarding.draft:";

export function firstUserOnboardingDismissKey(userId: string): string {
  return `${DISMISS_PREFIX}${userId}`;
}

export function firstUserOnboardingDraftKey(userId: string): string {
  return `${DRAFT_PREFIX}${userId}`;
}

/** Active (non-archived) coaching relationships. */
export function activeCoachingRelationships(clients: Client[]): Client[] {
  return clients.filter(client => !isClientArchived(client));
}

/** True when the coach has any stored relationship (including archived) or sessions. */
export function coachHasCoachingData(clients: Client[]): boolean {
  return clients.length > 0;
}

/**
 * Exact first-user onboarding trigger rule:
 * show only when the authenticated user has no coaching relationships/clients,
 * no sessions, and has not dismissed or completed onboarding.
 */
export function shouldShowFirstUserOnboarding(input: {
  clients: Client[];
  dismissed: boolean;
  /** Force-show after empty-home CTA even if previously dismissed. */
  forceStart?: boolean;
}): boolean {
  if (coachHasCoachingData(input.clients)) return false;
  if (input.forceStart) return true;
  return !input.dismissed;
}

export function isFirstUserOnboardingDismissed(
  storage: Pick<Storage, "getItem"> | null | undefined,
  userId: string
): boolean {
  if (!storage || !userId) return false;
  try {
    return storage.getItem(firstUserOnboardingDismissKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function dismissFirstUserOnboarding(
  persistentStorage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
  userId: string,
  draftStorage?: Pick<Storage, "removeItem"> | null
): void {
  if (!persistentStorage || !userId) return;
  try {
    persistentStorage.setItem(firstUserOnboardingDismissKey(userId), "1");
  } catch {
    // Ignore quota / private-mode failures — session-only dismiss still works via React state.
  }
  clearFirstUserOnboardingDraft(draftStorage ?? persistentStorage, userId);
}

export function clearFirstUserOnboardingDismiss(
  storage: Pick<Storage, "removeItem"> | null | undefined,
  userId: string
): void {
  if (!storage || !userId) return;
  try {
    storage.removeItem(firstUserOnboardingDismissKey(userId));
  } catch {
    // ignore
  }
}

export function loadFirstUserOnboardingDraft(
  storage: Pick<Storage, "getItem"> | null | undefined,
  userId: string
): FirstUserOnboardingDraft | null {
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(firstUserOnboardingDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FirstUserOnboardingDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    const step = parsed.step;
    if (
      step !== "welcome" &&
      step !== "relationship" &&
      step !== "conversation" &&
      step !== "complete"
    ) {
      return null;
    }
    return {
      step,
      relationship: {
        identityMode:
          parsed.relationship?.identityMode === "confidential"
            ? "confidential"
            : "standard",
        name: String(parsed.relationship?.name ?? ""),
        displayLabel: String(parsed.relationship?.displayLabel ?? ""),
        privateRealName: String(parsed.relationship?.privateRealName ?? ""),
        role: String(parsed.relationship?.role ?? ""),
        organisation: String(parsed.relationship?.organisation ?? ""),
        coachingFocus: String(parsed.relationship?.coachingFocus ?? ""),
      },
      conversation: {
        plannedDate: String(parsed.conversation?.plannedDate ?? ""),
        startTime: String(parsed.conversation?.startTime ?? ""),
        conversationFocus: String(parsed.conversation?.conversationFocus ?? ""),
      },
      createdClientId: parsed.createdClientId
        ? String(parsed.createdClientId)
        : undefined,
      createdSessionId: parsed.createdSessionId
        ? String(parsed.createdSessionId)
        : undefined,
    };
  } catch {
    return null;
  }
}

export function saveFirstUserOnboardingDraft(
  storage: Pick<Storage, "setItem"> | null | undefined,
  userId: string,
  draft: FirstUserOnboardingDraft
): void {
  if (!storage || !userId) return;
  try {
    storage.setItem(firstUserOnboardingDraftKey(userId), JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function clearFirstUserOnboardingDraft(
  storage: Pick<Storage, "removeItem"> | null | undefined,
  userId: string
): void {
  if (!storage || !userId) return;
  try {
    storage.removeItem(firstUserOnboardingDraftKey(userId));
  } catch {
    // ignore
  }
}

/** Client create payload — never includes organisation_id / organisationId. */
export function buildFirstUserClientPayload(draft: FirstUserRelationshipDraft) {
  if (draft.identityMode === "confidential") {
    return {
      identityMode: "confidential" as const,
      name: "",
      displayLabel: draft.displayLabel.trim() || draft.role.trim(),
      role: draft.role.trim(),
      organisation: draft.organisation.trim(),
      currentFocus: draft.coachingFocus.trim(),
      email: "",
      aiNameAllowed: false,
      privateRealName: draft.privateRealName.trim(),
    };
  }
  return {
    identityMode: "standard" as const,
    name: draft.name.trim(),
    displayLabel: draft.name.trim(),
    role: draft.role.trim(),
    organisation: draft.organisation.trim(),
    currentFocus: draft.coachingFocus.trim(),
    email: "",
    aiNameAllowed: false,
  };
}

/**
 * Guard: browser must never send organisation ownership for session create.
 * Returns a shallow copy with organisation fields stripped if present.
 */
export function stripBrowserOrganisationOwnership<T extends Record<string, unknown>>(
  body: T
): Omit<T, "organisationId" | "organisation_id"> {
  const {
    organisationId: _a,
    organisation_id: _b,
    ...safe
  } = body as T & {
    organisationId?: unknown;
    organisation_id?: unknown;
  };
  return safe;
}
