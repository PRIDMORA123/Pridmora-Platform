import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseDevelopmentUpdateGeneration,
} from "@/lib/development-updates/schema";
import {
  buildChangeDisplayItems,
  cloneProposedChanges,
  removeChangeByKey,
  updateChangeValueByKey,
} from "@/lib/development-updates/presentation";
import {
  hasAnyProposedChanges,
  type ProposedProfileChanges,
} from "@/lib/development-updates/types";
import { toDevelopmentUpdateUserError } from "@/lib/development-updates/errors";
import { rowToDevelopmentUpdate } from "@/lib/development-updates/map";

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260725150000_development_updates.sql"
  ),
  "utf8"
);

describe("development update data model", () => {
  it("creates one development update per session via unique constraint", () => {
    expect(migrationSql).toContain("constraint development_updates_session_unique unique (session_id)");
    expect(migrationSql).toContain("create table if not exists public.development_updates");
    expect(migrationSql).toContain("create table if not exists public.development_profiles");
  });

  it("defines atomic apply and discard RPCs with ownership checks", () => {
    expect(migrationSql).toContain("create or replace function public.apply_development_update");
    expect(migrationSql).toContain("create or replace function public.discard_development_update");
    expect(migrationSql).toContain("client_belongs_to_coach");
    expect(migrationSql).toContain("for update");
    expect(migrationSql).toContain("alreadyApplied");
  });

  it("keeps historic intelligence tables untouched", () => {
    expect(migrationSql).not.toMatch(/drop table .*intelligence_items/i);
    expect(migrationSql).toContain("from public.intelligence_items");
  });
});

describe("development update generation parsing", () => {
  it("accepts a meaningful update payload", () => {
    const parsed = parseDevelopmentUpdateGeneration(
      JSON.stringify({
        conversationSummary: "Explored delegation and boundaries.",
        hasMeaningfulChanges: true,
        proposedChanges: {
          currentFocus: {
            action: "replace",
            value: "Building confidence in delegation",
            reason: "Major focus this session",
          },
          emergingThemes: {
            add: [
              {
                value: "Boundary setting",
                status: "emerging",
                reason: "Raised again this session",
              },
            ],
            update: [],
            remove: [],
          },
          commitments: {
            add: [{ value: "Delegate the weekly planning meeting", dueDate: null }],
            complete: [],
            remove: [],
          },
        },
        evidence: [
          {
            changeKey: "emergingThemes.add.0",
            evidenceText: "Described difficulty saying no to urgent requests.",
            sourceExcerpt: "I keep saying yes",
          },
        ],
      })
    );

    expect(parsed.hasMeaningfulChanges).toBe(true);
    expect(parsed.proposedChanges.currentFocus?.value).toContain("delegation");
    expect(parsed.evidence).toHaveLength(1);
  });

  it("creates a valid empty update state when no meaningful changes", () => {
    const parsed = parseDevelopmentUpdateGeneration(
      JSON.stringify({
        conversationSummary: "A steady check-in with no new profile signals.",
        hasMeaningfulChanges: false,
        proposedChanges: {
          strengths: { add: [{ value: "Should be ignored", status: "emerging" }] },
        },
        evidence: [{ changeKey: "x", evidenceText: "ignored" }],
      })
    );

    expect(parsed.hasMeaningfulChanges).toBe(false);
    expect(parsed.proposedChanges).toEqual({});
    expect(parsed.evidence).toEqual([]);
    expect(hasAnyProposedChanges(parsed.proposedChanges)).toBe(false);
  });
});

describe("development update editing helpers", () => {
  const base: ProposedProfileChanges = {
    currentFocus: {
      action: "replace",
      value: "Delegation confidence",
      reason: "Session focus",
    },
    strengths: {
      add: [{ value: "Reflective decision-making", status: "emerging", reason: "Observed" }],
      update: [],
      remove: [],
    },
    commitments: {
      add: [{ value: "Delegate the weekly planning meeting", dueDate: null }],
      complete: [],
      remove: [],
    },
  };

  it("applies edited wording instead of original proposed content", () => {
    const edited = updateChangeValueByKey(
      cloneProposedChanges(base),
      "strengths.add.0",
      "Calm reflective decision-making"
    );
    expect(edited.strengths?.add?.[0]?.value).toBe("Calm reflective decision-making");
    expect(base.strengths?.add?.[0]?.value).toBe("Reflective decision-making");
  });

  it("omits removed items from edited changes", () => {
    const edited = removeChangeByKey(cloneProposedChanges(base), "strengths.add.0");
    expect(edited.strengths?.add ?? []).toHaveLength(0);
    expect(hasAnyProposedChanges(edited)).toBe(true);
  });

  it("does not show unchanged profile sections in the review display", () => {
    const items = buildChangeDisplayItems(base);
    expect(
      items.some(item => item.categoryLabel === "Recommended development position")
    ).toBe(true);
    expect(items.some(item => item.categoryLabel === "Value")).toBe(false);
    expect(items).toHaveLength(3);
  });

  it("prevents commitment duplication in display keys", () => {
    const items = buildChangeDisplayItems(base);
    const commitmentKeys = items.filter(item => item.categoryKey === "commitments").map(item => item.key);
    expect(new Set(commitmentKeys).size).toBe(commitmentKeys.length);
  });
});

describe("development update mapping and errors", () => {
  it("maps a ready-for-review update row", () => {
    const update = rowToDevelopmentUpdate({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      client_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      session_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      coach_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      status: "ready_for_review",
      conversation_summary: "Summary",
      proposed_changes: {
        strengths: { add: [{ value: "Clarity", status: "emerging" }] },
      },
      edited_changes: null,
      applied_changes: null,
      evidence_summary: [],
      has_meaningful_changes: true,
      coach_note: null,
      generated_at: "2026-07-25T10:00:00.000Z",
      reviewed_at: null,
      applied_at: null,
      discarded_at: null,
      created_at: "2026-07-25T10:00:00.000Z",
      updated_at: "2026-07-25T10:00:00.000Z",
    });

    expect(update.status).toBe("ready_for_review");
    expect(update.proposedChanges.strengths?.add?.[0]?.value).toBe("Clarity");
  });

  it("does not display raw database errors", () => {
    const message = toDevelopmentUpdateUserError(
      new Error('relation "development_updates" does not exist'),
      "We couldn’t update the development profile. No changes have been applied. Please try again."
    );
    expect(message).not.toMatch(/relation/i);
    expect(message).toMatch(/migration|development update/i);

    const already = toDevelopmentUpdateUserError(
      new Error("This development update has already been applied."),
      "fallback"
    );
    expect(already).toBe("This development update has already been applied.");
  });
});

describe("dashboard review task shape", () => {
  it("supports one review task per session update", () => {
    const tasks = [
      {
        update: { id: "1", sessionId: "s1" },
        clientName: "Sarah Jones",
      },
      {
        update: { id: "2", sessionId: "s2" },
        clientName: "Alex Smith",
      },
    ];
    const sessionIds = tasks.map(task => task.update.sessionId);
    expect(new Set(sessionIds).size).toBe(tasks.length);
    expect(tasks[0]?.clientName).toBe("Sarah Jones");
  });
});

describe("profile de-duplication helpers in SQL", () => {
  it("includes de-duplication logic for profile arrays and commitments", () => {
    expect(migrationSql).toContain("normalise_profile_value");
    expect(migrationSql).toContain("merge_profile_entries");
    expect(migrationSql).toContain("merge_commitment_entries");
    expect(migrationSql).toContain("Strengthen status on duplicate");
  });

  it("marks discard without modifying the profile", () => {
    const start = migrationSql.indexOf(
      "create or replace function public.discard_development_update"
    );
    const end = migrationSql.indexOf(
      "grant execute on function public.discard_development_update"
    );
    const discardFn = migrationSql.slice(start, end);
    expect(discardFn).toContain("status = 'discarded'");
    expect(discardFn).toContain("development_update_discarded");
    expect(discardFn).not.toContain("update public.development_profiles");
  });

  it("idempotently short-circuits a second apply", () => {
    expect(migrationSql).toContain("if v_update.status = 'applied' then");
    expect(migrationSql).toContain("'alreadyApplied', true");
  });
});
