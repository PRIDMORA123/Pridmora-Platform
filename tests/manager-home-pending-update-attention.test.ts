import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildManagerHomeAttentionItems,
  PENDING_DEVELOPMENT_UPDATE_ATTENTION_LABEL,
  PENDING_DEVELOPMENT_UPDATE_ATTENTION_RANK,
} from "@/lib/people/manager-home-attention";
import { getPeopleAttentionRank, getPeopleNextActionLabel } from "@/lib/people/attention-order";
import { createBlankSession } from "@/lib/sessions";
import type { DevelopmentUpdate, DevelopmentUpdateReviewTask } from "@/lib/development-updates/types";
import type { Client, Session } from "@/lib/types";

function makeSession(
  overrides: Partial<Session> & { sessionNumber?: number } = {}
): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: overrides.clientId ?? "client-1",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status ?? "planned",
    }),
    ...overrides,
  };
}

function makeClient(
  overrides: Partial<Client> & { sessions?: Session[] } = {}
): Client {
  return {
    id: overrides.id ?? "client-1",
    name: overrides.name ?? "Alex Example",
    initials: "AE",
    organisation: "Example Org",
    role: "Manager",
    email: "",
    status: overrides.status ?? "Active",
    createdAt: "2026-01-01T00:00:00.000Z",
    nextSession: "",
    currentFocus: overrides.currentFocus ?? "Build confidence",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: overrides.sessions ?? [],
    journey: [],
    ...overrides,
  };
}

function makeUpdate(
  overrides: Partial<DevelopmentUpdate> & Pick<DevelopmentUpdate, "id" | "clientId">
): DevelopmentUpdate {
  return {
    sessionId: "session-1",
    coachId: "coach-1",
    status: "ready_for_review",
    conversationSummary: "Summary",
    proposedChanges: { currentFocus: { action: "replace", value: "Delegation" } },
    editedChanges: null,
    appliedChanges: null,
    evidenceSummary: [],
    hasMeaningfulChanges: true,
    coachNote: "",
    generatedAt: "2026-08-20T10:00:00.000Z",
    reviewedAt: null,
    appliedAt: null,
    discardedAt: null,
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

function makeTask(
  client: Client,
  update: DevelopmentUpdate
): DevelopmentUpdateReviewTask {
  return {
    update,
    clientId: client.id,
    clientName: client.name,
    sessionId: update.sessionId,
    sessionDate: "2026-08-20",
  };
}

describe("buildManagerHomeAttentionItems pending Development Update", () => {
  it("surfaces ready_for_review on a quiet person as Review development update", () => {
    const person = makeClient({ id: "p-1", name: "Sam Team", sessions: [] });
    const update = makeUpdate({ id: "upd-1", clientId: person.id });
    const items = buildManagerHomeAttentionItems([person], [makeTask(person, update)]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      personId: "p-1",
      personName: "Sam Team",
      nextActionLabel: PENDING_DEVELOPMENT_UPDATE_ATTENTION_LABEL,
      rank: PENDING_DEVELOPMENT_UPDATE_ATTENTION_RANK,
      updateId: "upd-1",
    });
  });

  it("does not replace an incomplete live conversation with Review development update", () => {
    const live = makeClient({
      id: "p-live",
      name: "Mia Active",
      sessions: [makeSession({ clientId: "p-live", status: "in_progress" })],
    });
    const update = makeUpdate({ id: "upd-live", clientId: live.id });
    const items = buildManagerHomeAttentionItems([live], [makeTask(live, update)]);

    expect(getPeopleAttentionRank(live)).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]?.nextActionLabel).toBe("Continue conversation");
    expect(items[0]?.updateId).toBeUndefined();
  });

  it("does not replace notes or Summary & Insights with Review development update", () => {
    const notes = makeClient({
      id: "p-notes",
      name: "Notes Person",
      sessions: [makeSession({ clientId: "p-notes", status: "awaiting_completion" })],
    });
    const summary = makeClient({
      id: "p-summary",
      name: "Summary Person",
      sessions: [
        makeSession({
          clientId: "p-summary",
          status: "awaiting_completion",
          reflectWhatSurprised: "A clear shift.",
          commitments: "Ask earlier.",
          summaryStatus: "draft",
          summary: "Draft summary",
        }),
      ],
    });

    const notesItems = buildManagerHomeAttentionItems(
      [notes],
      [makeTask(notes, makeUpdate({ id: "upd-notes", clientId: notes.id }))]
    );
    expect(notesItems[0]?.nextActionLabel).toBe("Capture session notes");
    expect(notesItems[0]?.updateId).toBeUndefined();

    const summaryItems = buildManagerHomeAttentionItems(
      [summary],
      [makeTask(summary, makeUpdate({ id: "upd-summary", clientId: summary.id }))]
    );
    expect(getPeopleNextActionLabel(summary)).toBe("Review Summary & Insights");
    expect(summaryItems[0]?.nextActionLabel).toBe("Review Summary & Insights");
    expect(summaryItems[0]?.updateId).toBeUndefined();
  });

  it("prefers Review development update over preparing or starting the next conversation", () => {
    const prepared = makeClient({
      id: "p-prepared",
      name: "Owen Prepared",
      sessions: [makeSession({ clientId: "p-prepared", status: "prepared" })],
    });
    const items = buildManagerHomeAttentionItems(
      [prepared],
      [makeTask(prepared, makeUpdate({ id: "upd-prep", clientId: prepared.id }))]
    );
    expect(getPeopleNextActionLabel(prepared)).toBe("Start conversation");
    expect(items[0]?.nextActionLabel).toBe(PENDING_DEVELOPMENT_UPDATE_ATTENTION_LABEL);
    expect(items[0]?.updateId).toBe("upd-prep");
  });

  it("sorts pending review after live conversation and before preparation", () => {
    const live = makeClient({
      id: "p-live",
      name: "Mia Active",
      sessions: [makeSession({ clientId: "p-live", status: "in_progress" })],
    });
    const pending = makeClient({ id: "p-pending", name: "Sam Team", sessions: [] });
    const planned = makeClient({
      id: "p-planned",
      name: "Zoe Planned",
      sessions: [makeSession({ clientId: "p-planned", status: "planned" })],
    });

    const items = buildManagerHomeAttentionItems(
      [planned, pending, live],
      [makeTask(pending, makeUpdate({ id: "upd-1", clientId: pending.id }))]
    );

    expect(items.map(item => item.personId)).toEqual([
      "p-live",
      "p-pending",
      "p-planned",
    ]);
    expect(items[1]?.nextActionLabel).toBe(PENDING_DEVELOPMENT_UPDATE_ATTENTION_LABEL);
  });

  it("drops the attention item after Apply or Discard (no ready_for_review task)", () => {
    const person = makeClient({ id: "p-1", name: "Sam Team", sessions: [] });
    const before = buildManagerHomeAttentionItems(
      [person],
      [makeTask(person, makeUpdate({ id: "upd-1", clientId: person.id }))]
    );
    expect(before).toHaveLength(1);

    const afterApply = buildManagerHomeAttentionItems([person], []);
    expect(afterApply).toEqual([]);
  });

  it("does not surface another Manager's pending update", () => {
    const mine = makeClient({ id: "mine", name: "My Person", sessions: [] });
    const theirs = makeUpdate({ id: "upd-theirs", clientId: "someone-else" });
    const items = buildManagerHomeAttentionItems(
      [mine],
      [
        {
          update: theirs,
          clientId: "someone-else",
          clientName: "Other Person",
          sessionId: "session-other",
          sessionDate: "2026-08-20",
        },
      ]
    );
    expect(items).toEqual([]);
  });

  it("does not surface self-development records", () => {
    const self = makeClient({
      id: "self-1",
      name: "My development",
      role: "Self development",
      isSelfDevelopment: true,
      sessions: [],
    });
    const items = buildManagerHomeAttentionItems(
      [self],
      [makeTask(self, makeUpdate({ id: "upd-self", clientId: self.id }))]
    );
    expect(items).toEqual([]);
  });

  it("does not surface zero-change ready_for_review rows", () => {
    const person = makeClient({ id: "p-1", name: "Sam Team", sessions: [] });
    const update = makeUpdate({
      id: "upd-empty",
      clientId: person.id,
      hasMeaningfulChanges: false,
    });
    const items = buildManagerHomeAttentionItems([person], [makeTask(person, update)]);
    expect(items).toEqual([]);
  });

  it("does not change People-list attention ranks", () => {
    const quiet = makeClient({ sessions: [] });
    expect(getPeopleAttentionRank(quiet)).toBe(6);
    expect(getPeopleNextActionLabel(quiet)).toBe("Plan next conversation");
  });
});

describe("Manager Home wires pending update recovery", () => {
  it("passes awaiting updates into Needs attention and reviews via existing callback", () => {
    const today = readFileSync(
      resolve(process.cwd(), "components/today-view.tsx"),
      "utf8"
    );
    expect(today).toContain("awaitingUpdates={awaitingUpdates}");
    expect(today).toContain("onReviewDevelopmentUpdate={(client, updateId)");

    const mcc = readFileSync(
      resolve(process.cwd(), "components/identity/manager-command-centre.tsx"),
      "utf8"
    );
    expect(mcc).toContain("buildManagerHomeAttentionItems(clients, awaitingUpdates)");
    expect(mcc).toContain("onReviewDevelopmentUpdate(person, item.updateId)");
  });
});
