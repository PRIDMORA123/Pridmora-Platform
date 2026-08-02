import { buildSessionModuleRoute } from "@/lib/session-module-route";
import type { SessionModuleRoute } from "@/lib/session-module-route";

export type CreateSummaryInsightsPhase =
  | "idle"
  | "saving"
  | "generating"
  | "opening";

export type CreateSummaryInsightsFlowResult =
  | {
      ok: true;
      sessionId: string;
      relationshipId: string;
      route: SessionModuleRoute;
    }
  | {
      ok: false;
      reason: "save_failed" | "generate_failed";
      error: unknown;
      sessionId: string;
      relationshipId: string;
    };

/**
 * Explicit Create Summary & Insights sequence:
 * save notes → generate → navigate to Summary & Insights for the same session.
 *
 * Does not navigate before save and generation complete.
 * Preserves notes when generation fails (caller must not roll back).
 */
export async function runCreateSummaryInsightsFlow(input: {
  relationshipId: string;
  sessionId: string;
  saveNotes: () => Promise<{ id: string }>;
  generateSummary: (sessionId: string) => Promise<unknown>;
  onPhase?: (phase: CreateSummaryInsightsPhase) => void;
}): Promise<CreateSummaryInsightsFlowResult> {
  const { relationshipId, sessionId } = input;

  if (!sessionId) {
    throw new Error(
      "Cannot create Summary & Insights without a session ID."
    );
  }

  input.onPhase?.("saving");

  let saved: { id: string };
  try {
    saved = await input.saveNotes();
  } catch (error) {
    return {
      ok: false,
      reason: "save_failed",
      error,
      sessionId,
      relationshipId,
    };
  }

  const confirmedSessionId = saved.id || sessionId;
  if (!confirmedSessionId) {
    throw new Error(
      "Cannot create Summary & Insights without a session ID."
    );
  }

  input.onPhase?.("generating");

  try {
    await input.generateSummary(confirmedSessionId);
  } catch (error) {
    return {
      ok: false,
      reason: "generate_failed",
      error,
      sessionId: confirmedSessionId,
      relationshipId,
    };
  }

  input.onPhase?.("opening");

  const route = buildSessionModuleRoute({
    relationshipId,
    sessionId: confirmedSessionId,
    module: "identity_intelligence",
  });

  return {
    ok: true,
    sessionId: confirmedSessionId,
    relationshipId,
    route,
  };
}

/**
 * Stage sync after parent session props update.
 * Only reset workspace stage when the session or intentional module target changes —
 * never when notes/summary evidence updates after save or generation.
 */
export function shouldResetWorkspaceStage(input: {
  previousSessionId: string;
  nextSessionId: string;
  previousInitialStage: string | null | undefined;
  nextInitialStage: string | null | undefined;
}): boolean {
  return (
    input.previousSessionId !== input.nextSessionId ||
    input.previousInitialStage !== input.nextInitialStage
  );
}
