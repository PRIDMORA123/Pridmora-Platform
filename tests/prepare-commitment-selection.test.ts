import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertActionInDb = vi.fn();

vi.mock("@/lib/supabase/repository", () => ({
  upsertActionInDb: (...args: unknown[]) => upsertActionInDb(...args),
}));

import {
  areNearDuplicateCommitments,
  preferCommitmentWording,
  selectCommitmentsForPrepare,
  selectOpenActionsForPrepare,
  selectPrimaryPreviousCommitment,
  hasNearDuplicateOpenAction,
} from "@/lib/preparation/commitment-selection";
import { syncCommitmentActionsAfterApply } from "@/lib/development-updates/sync-commitment-actions";
import { buildPreparationAdapterContext } from "@/lib/preparation/preparation-intelligence-adapter";
import { createBlankSession } from "@/lib/sessions";
import type { Client, Session } from "@/lib/types";

const SESSION_1_CONCERNS =
  "Practise raising concerns and clarifying responsibilities earlier when project delivery may be affected.";
const SESSION_2_SHORT =
  "State a clear recommendation, rather than only raising the problem, in the next relevant project discussion.";
const SESSION_2_FULL =
  "Alex agreed to practise stating their recommendation clearly, rather than only raising the problem, in the next relevant project discussion.";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    ...createBlankSession({
      id: "s1",
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: 1,
      status: "completed",
    }),
    summaryStatus: "approved",
    aiSummaryApproved: true,
    ...overrides,
  };
}

function mockSupabaseWithOpenActions(
  rows: Array<Record<string, unknown>>
) {
  const result = { data: rows, error: null };
  const builder: {
    select: () => typeof builder;
    eq: () => typeof builder;
    then: (
      onFulfilled: (value: typeof result) => unknown
    ) => Promise<unknown>;
  } = {
    select: () => builder,
    eq: () => builder,
    then: onFulfilled => Promise.resolve(result).then(onFulfilled),
  };
  return {
    from: () => builder,
  };
}

describe("prepare commitment near-duplicate detection", () => {
  it("treats Session 2 recommendation paraphrases as near-duplicates", () => {
    expect(areNearDuplicateCommitments(SESSION_2_SHORT, SESSION_2_FULL)).toBe(
      true
    );
  });

  it("does not merge distinct Session 1 and Session 2 commitments", () => {
    expect(
      areNearDuplicateCommitments(SESSION_1_CONCERNS, SESSION_2_FULL)
    ).toBe(false);
    expect(
      areNearDuplicateCommitments(SESSION_1_CONCERNS, SESSION_2_SHORT)
    ).toBe(false);
  });

  it("prefers later / more complete wording", () => {
    expect(preferCommitmentWording(SESSION_2_SHORT, SESSION_2_FULL)).toBe(
      SESSION_2_FULL
    );
  });
});

describe("selectCommitmentsForPrepare prioritisation", () => {
  const session1 = makeSession({ id: "s1", sessionNumber: 1 });
  const session2 = makeSession({ id: "s2", sessionNumber: 2 });
  const session4 = makeSession({
    id: "s4",
    sessionNumber: 4,
    status: "in_progress",
    summaryStatus: "not_generated",
    aiSummaryApproved: false,
  });

  const fixtureActions = [
    {
      id: "a1",
      title: SESSION_1_CONCERNS,
      status: "Open" as const,
      sessionId: "s1",
    },
    {
      id: "a2-short",
      title: SESSION_2_SHORT,
      status: "Open" as const,
      sessionId: "s2",
    },
    {
      id: "a2-full",
      title: SESSION_2_FULL,
      status: "Open" as const,
      sessionId: "s2",
    },
  ];

  it("collapses near-duplicate Session 2 actions to one prepare commitment", () => {
    const commitments = selectCommitmentsForPrepare({
      actions: fixtureActions,
      sessions: [session1, session2, session4],
      currentSessionId: "s4",
      beforeSessionNumber: 4,
      allowUndatedOpenActions: true,
    });
    expect(commitments).toHaveLength(2);
    expect(
      commitments.filter(item => /recommendation/i.test(item))
    ).toHaveLength(1);
  });

  it("prefers the later more complete Session 2 wording", () => {
    const commitments = selectCommitmentsForPrepare({
      actions: fixtureActions,
      sessions: [session1, session2, session4],
      currentSessionId: "s4",
      beforeSessionNumber: 4,
    });
    expect(commitments[0]).toBe(SESSION_2_FULL);
    expect(selectPrimaryPreviousCommitment(commitments)).toBe(SESSION_2_FULL);
  });

  it("keeps the distinct Session 1 commitment visible", () => {
    const commitments = selectCommitmentsForPrepare({
      actions: fixtureActions,
      sessions: [session1, session2, session4],
      currentSessionId: "s4",
      beforeSessionNumber: 4,
    });
    expect(commitments).toContain(SESSION_1_CONCERNS);
  });

  it("selects Session 2 recommendation as singular Previous commitment", () => {
    const actions = selectOpenActionsForPrepare({
      actions: fixtureActions,
      sessions: [session1, session2, session4],
      currentSessionId: "s4",
      beforeSessionNumber: 4,
    });
    expect(actions[0]?.title).toBe(SESSION_2_FULL);
    expect(selectPrimaryPreviousCommitment(actions.map(a => a.title))).toBe(
      SESSION_2_FULL
    );
  });

  it("does not incorrectly merge genuinely distinct commitments", () => {
    const commitments = selectCommitmentsForPrepare({
      actions: [
        {
          id: "a1",
          title: SESSION_1_CONCERNS,
          status: "Open",
          sessionId: "s1",
        },
        {
          id: "a2",
          title: SESSION_2_FULL,
          status: "Open",
          sessionId: "s2",
        },
      ],
      sessions: [session1, session2, session4],
      currentSessionId: "s4",
      beforeSessionNumber: 4,
    });
    expect(commitments).toEqual([SESSION_2_FULL, SESSION_1_CONCERNS]);
  });

  it("keeps temporal bound to sessions before N", () => {
    const commitments = selectCommitmentsForPrepare({
      actions: [
        ...fixtureActions,
        {
          id: "a4",
          title: "Do not appear in Session 4 prepare",
          status: "Open",
          sessionId: "s4",
        },
      ],
      sessions: [session1, session2, session4],
      currentSessionId: "s4",
      beforeSessionNumber: 4,
    });
    expect(commitments.join(" ")).not.toMatch(/Do not appear/i);
    expect(
      selectCommitmentsForPrepare({
        actions: fixtureActions,
        sessions: [session1, session2],
        currentSessionId: "s1",
        beforeSessionNumber: 1,
        allowUndatedOpenActions: false,
      })
    ).toEqual([]);
  });

  it("adapter prompt receives the prioritised commitment set", () => {
    const client = {
      id: "client-1",
      name: "Alex Morgan",
      role: "Manager",
      currentFocus: "",
      sessions: [session1, session2, session4],
      actions: fixtureActions,
    } as Client;

    const adapter = buildPreparationAdapterContext({
      client,
      currentSession: session4,
      profile: null,
      patterns: [],
    });

    expect(adapter.previousCommitment).toBe(SESSION_2_FULL);
    expect(adapter.prompt.commitments).toContain(SESSION_2_FULL);
    expect(adapter.prompt.commitments).toContain(SESSION_1_CONCERNS);
    expect(adapter.prompt.commitments).not.toContain(SESSION_2_SHORT);
  });
});

describe("syncCommitmentActionsAfterApply near-duplicate guard", () => {
  beforeEach(() => {
    upsertActionInDb.mockReset();
  });

  it("does not create a second near-duplicate open action", async () => {
    const supabase = mockSupabaseWithOpenActions([
      {
        id: "existing",
        title: SESSION_2_SHORT,
        status: "Open",
        session_id: "s2",
        event_date: null,
        owner: null,
        detail: null,
      },
    ]);

    const result = await syncCommitmentActionsAfterApply(
      supabase as never,
      "coach-1",
      "client-1",
      "s2",
      {
        commitments: {
          add: [{ value: SESSION_2_FULL, dueDate: null }],
          complete: [],
          remove: [],
        },
      }
    );

    expect(result.created).toBe(0);
    expect(upsertActionInDb).not.toHaveBeenCalled();
    expect(hasNearDuplicateOpenAction([SESSION_2_SHORT], SESSION_2_FULL)).toBe(
      true
    );
  });
});
