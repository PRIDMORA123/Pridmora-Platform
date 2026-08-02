import type { AppView } from "@/components/app-shell";
import type { SessionModuleId } from "@/lib/relationship-workspace";
import type { SessionWorkspaceStage } from "@/lib/session-workflow";

/**
 * Canonical session-module destination for the Identity SPA.
 *
 * All Session Notes / Summary & Insights / Conversation / Next Focus entry
 * points must resolve through this helper so the same relationshipId,
 * sessionId, and workspace stage are always used together.
 *
 * Visible label "Summary & Insights" maps to module `identity_intelligence`
 * and workspace stage `summary`.
 */
export type SessionModuleRoute = {
  /** Documented canonical path shape — not a Next.js file route. */
  path: `/people/${string}/sessions/${string}/${SessionModuleId}`;
  view: Extract<AppView, "session" | "prepare">;
  relationshipId: string;
  sessionId: string;
  module: SessionModuleId;
  stage: SessionWorkspaceStage | null;
};

const MODULE_TO_STAGE: Record<SessionModuleId, SessionWorkspaceStage | null> = {
  prepare: null,
  conversation: "coach",
  session_notes: "reflect",
  identity_intelligence: "summary",
  next_focus: "actions",
};

export function sessionModuleToWorkspaceStage(
  module: SessionModuleId
): SessionWorkspaceStage | null {
  return MODULE_TO_STAGE[module];
}

export function buildSessionModuleRoute(input: {
  relationshipId: string;
  sessionId: string;
  module: SessionModuleId;
}): SessionModuleRoute {
  const { relationshipId, sessionId, module } = input;

  if (!sessionId) {
    throw new Error(
      module === "identity_intelligence"
        ? "Cannot create Summary & Insights without a session ID."
        : "Cannot open a session module without a session ID."
    );
  }

  if (module === "prepare") {
    return {
      path: `/people/${relationshipId}/sessions/${sessionId}/prepare`,
      view: "prepare",
      relationshipId,
      sessionId,
      module,
      stage: null,
    };
  }

  return {
    path: `/people/${relationshipId}/sessions/${sessionId}/${module}`,
    view: "session",
    relationshipId,
    sessionId,
    module,
    stage: sessionModuleToWorkspaceStage(module),
  };
}
