import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildCompletedActionReflectionContext,
  listCompletedDevelopmentActions,
  parseMyDevelopmentActionOperation,
  rejectSelfActionOwnershipFields,
  resolveStatusForOperation,
} from "@/lib/my-development/self-action";
import {
  listActiveDevelopmentActions,
  resolveMyDevelopmentNextStep,
} from "@/lib/my-development/next-step";
import type { CoachingAction } from "@/lib/types";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function action(
  id: string,
  title: string,
  status: CoachingAction["status"]
): CoachingAction {
  return {
    id,
    title,
    status,
    clientId: "self-a",
    sessionId: null,
  };
}

describe("Stage 2.3.2.1 practice lifecycle", () => {
  it("maps complete/reopen operations to allowed statuses only", () => {
    expect(parseMyDevelopmentActionOperation("complete")).toBe("complete");
    expect(parseMyDevelopmentActionOperation("reopen")).toBe("reopen");
    expect(parseMyDevelopmentActionOperation("Open")).toBeNull();
    expect(parseMyDevelopmentActionOperation("In progress")).toBeNull();
    expect(resolveStatusForOperation("complete", "Open")).toBe("Complete");
    expect(resolveStatusForOperation("complete", "In progress")).toBe(
      "Complete"
    );
    expect(resolveStatusForOperation("complete", "Complete")).toEqual({
      error: "Only Open or In progress actions can be marked complete.",
    });
    expect(resolveStatusForOperation("reopen", "Complete")).toBe("Open");
    expect(resolveStatusForOperation("reopen", "Open")).toEqual({
      error: "Only completed actions can be reopened.",
    });
  });

  it("rejects browser-supplied ownership fields", () => {
    for (const key of [
      "clientId",
      "organisationId",
      "personId",
      "coachId",
      "selfClientId",
    ]) {
      expect(rejectSelfActionOwnershipFields({ [key]: "x" }).ok).toBe(false);
    }
    expect(rejectSelfActionOwnershipFields({ operation: "complete" }).ok).toBe(
      true
    );
  });

  it("keeps completed actions out of practising list and bounds reopen list", () => {
    const actions = [
      action("c1", "Done one", "Complete"),
      action("o1", "Practise ask", "Open"),
      action("p1", "Try question", "In progress"),
      action("c2", "Done two", "Complete"),
      action("c3", "Done three", "Complete"),
      action("c4", "Done four", "Complete"),
    ];
    expect(listActiveDevelopmentActions(actions, 3).map(a => a.id)).toEqual([
      "o1",
      "p1",
    ]);
    expect(listCompletedDevelopmentActions(actions, 3).map(a => a.id)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
  });

  it("recalculates next step after complete and reopen transitions", () => {
    const withActive = [
      action("c1", "Done", "Complete"),
      action("o1", "Still practising", "Open"),
    ];
    expect(resolveMyDevelopmentNextStep({ focusCount: 1, actions: withActive }).kind).toBe(
      "action"
    );

    const allComplete = [action("c1", "Done", "Complete")];
    expect(
      resolveMyDevelopmentNextStep({ focusCount: 1, actions: allComplete })
    ).toEqual({ kind: "reflect-or-talk" });

    const reopened = [action("c1", "Done", "Open")];
    expect(
      resolveMyDevelopmentNextStep({ focusCount: 1, actions: reopened }).kind
    ).toBe("action");
  });

  it("builds reflection context from action title without action id", () => {
    expect(
      buildCompletedActionReflectionContext("Practise a clearer ask")
    ).toBe("Completed development action: Practise a clearer ask");
    expect(
      buildCompletedActionReflectionContext("Practise a clearer ask")
    ).not.toMatch(/[0-9a-f-]{36}/i);
  });

  it("wires dedicated self-action PATCH route with ownership checks", () => {
    const route = read(
      "app/api/my-development/actions/[actionId]/route.ts"
    );
    const lib = read("lib/my-development/self-action.ts");
    expect(route).toContain("export async function PATCH");
    expect(route).toContain("updateMyDevelopmentActionLifecycle");
    expect(route).toContain("rejectSelfActionOwnershipFields");
    expect(route).not.toContain("/api/actions");
    expect(lib).toContain("ensureSelfDevelopmentRelationship");
    expect(lib).toContain("rowClientId !== selfClient.id");
    expect(lib).toContain("organisation_id");
    expect(lib).toContain('eq("item_type", "action")');
    expect(lib).toContain("throw new OwnershipError()");
  });

  it("overview uses self-action route for complete/reopen and not generic PUT", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).toContain("/api/my-development/actions/");
    expect(view).toContain('operation: "complete"');
    expect(view).toContain('operation: "reopen"');
    expect(view).toContain("Mark complete");
    expect(view).toContain("Reopen");
    expect(view).toContain("show recent");
    expect(view).not.toMatch(
      /api\/actions[\s\S]{0,120}method:\s*"PUT"/
    );
    expect(view).not.toContain("Mark in progress");
    expect(view).not.toContain("<select");
  });

  it("shows reflection prompt only after successful complete and never auto-saves", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).toContain("Action completed.");
    expect(view).toContain("What did you notice?");
    expect(view).toContain("Reflect now");
    expect(view).toContain("Not now");
    expect(view).toContain("setCompletionPrompt({ title: action.title })");
    expect(view).toContain("setCompletionPrompt(null)");
    // Prompt set only after await apiJson complete succeeds.
    const completeFn = view.slice(
      view.indexOf("async function completeAction"),
      view.indexOf("async function reopenAction")
    );
    expect(completeFn.indexOf("await apiJson")).toBeLessThan(
      completeFn.indexOf("setCompletionPrompt({ title")
    );
    expect(completeFn).toContain("setCompletionPrompt(null)");
    expect(completeFn).not.toContain("/api/my-development/reflection");
  });

  it("Reflect now uses in-memory prefill into existing Reflection view", () => {
    const home = read("components/home-app.tsx");
    const reflection = read("components/my-development-reflection-view.tsx");
    const view = read("components/my-development-view.tsx");
    expect(home).toContain("reflectionPrefill");
    expect(home).toContain("onReflectAfterComplete");
    expect(home).toContain("initialPrefill={reflectionPrefill}");
    expect(home).toContain("onPrefillConsumed");
    expect(reflection).toContain("initialPrefill");
    expect(reflection).toContain("setContext(initialPrefill.context.trim())");
    expect(reflection).toContain("setWriting(true)");
    expect(view).toContain("buildCompletedActionReflectionContext");
    expect(view).not.toContain("localStorage");
    expect(view).not.toContain("sessionStorage");
    expect(home).not.toContain("localStorage");
    expect(home).not.toContain("sessionStorage");
    expect(home).not.toMatch(
      /my-development-reflection\?[^\n]*context=/
    );
    expect(reflection).not.toMatch(/searchParams|URLSearchParams|useSearchParams/);
  });

  it("preserves Stage 2.3.1 story hierarchy and existing reflection write", () => {
    const view = read("components/my-development-view.tsx");
    const reflection = read("components/my-development-reflection-view.tsx");
    const focus = view.indexOf("Your focus");
    const practising = view.indexOf("What you&apos;re practising");
    const learning = view.indexOf("What you&apos;re learning");
    const next = view.indexOf("Your next step");
    expect(focus).toBeGreaterThan(-1);
    expect(practising).toBeGreaterThan(focus);
    expect(learning).toBeGreaterThan(practising);
    expect(next).toBeGreaterThan(learning);
    expect(reflection).toContain('"/api/my-development/reflection"');
    expect(reflection).toContain('method: "POST"');
  });

  it("does not modify Aurelia capture paths and keeps Aurelia actions compatible", () => {
    const capture = read("components/aurelia/manager-aurelia-capture.tsx");
    const captureRoute = read(
      "app/api/my-development/aurelia/capture-action/route.ts"
    );
    const chat = read("app/api/my-development/aurelia/chat/route.ts");
    expect(captureRoute).toContain('status: "Open"');
    expect(captureRoute).toContain("ensureSelfDevelopmentRelationship");
    expect(capture).toContain("/api/my-development/aurelia/capture-action");
    expect(chat).toContain("loadManagerAureliaDevelopmentContext");
    // Self lifecycle path can complete ordinary Open self actions.
    expect(read("lib/my-development/self-action.ts")).toContain(
      'return "Complete"'
    );
  });

  it("creates no migration and leaves Person Prepare untouched", () => {
    const migrations = readdirSync(join(root, "supabase/migrations"));
    expect(
      migrations.some(name =>
        /2\.3\.2|practice.?lifecycle|completed_at/i.test(name)
      )
    ).toBe(false);
    expect(read("lib/my-development/self-action.ts")).not.toContain(
      "completed_at"
    );
    expect(read("components/prepare/preparation-ready-panel.tsx")).toContain(
      "Preparation"
    );
  });
});
