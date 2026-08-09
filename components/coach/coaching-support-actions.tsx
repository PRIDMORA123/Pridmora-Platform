"use client";

import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

import { useState } from "react";
import { useToast } from "@/components/feedback/toast-provider";
import { CoachingSupportDrawer } from "@/components/coach/coaching-support-drawer";
import { generateCoachingSupport } from "@/lib/coach-workspace";
import type {
  CoachingSupportAction,
  CoachingSupportResult,
} from "@/types/coach-workspace";

type Props = {
  notes: string;
  focus?: string | null;
  clientName?: string;
  clientId?: string;
  preparation?: string;
  onAddToNotes: (content: string) => void;
};

export function CoachingSupportActions({
  notes,
  focus,
  clientName,
  clientId,
  preparation,
  onAddToNotes,
}: Props) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const [workingAction, setWorkingAction] = useState<CoachingSupportAction | null>(
    null
  );
  const [supportResult, setSupportResult] = useState<CoachingSupportResult | null>(
    null
  );

  const { showToast } = useToast();

  async function runSupportAction(action: CoachingSupportAction) {
    if (workingAction) return;

    setWorkingAction(action);

    try {
      const result = await generateCoachingSupport(action, {
        notes,
        focus: focus || "",
        clientName,
        clientId,
        preparation,
      });

      setSupportResult(result);
    } catch (error) {
      console.error("Coaching support failed", error);

      showToast({
        type: "error",
        title: `${language.supportLabel} is unavailable`,
        description: "Your notes have not been changed.",
      });
    } finally {
      setWorkingAction(null);
    }
  }

  return (
    <>
      <section className="coaching-support-card">
        <p className="coach-section-label">{language.supportLabel}</p>

        <h3>Need a prompt?</h3>

        <p>Generate optional guidance without changing your notes.</p>

        <div className="coaching-support-actions">
          <SupportButton
            label="Suggest a question"
            loadingLabel="Thinking…"
            isLoading={workingAction === "suggest_question"}
            disabled={Boolean(workingAction)}
            onClick={() => runSupportAction("suggest_question")}
          />

          <SupportButton
            label="Identify themes"
            loadingLabel="Reviewing…"
            isLoading={workingAction === "identify_themes"}
            disabled={Boolean(workingAction)}
            onClick={() => runSupportAction("identify_themes")}
          />

          <SupportButton
            label="Draft session summary"
            loadingLabel="Drafting…"
            isLoading={workingAction === "draft_summary"}
            disabled={Boolean(workingAction)}
            onClick={() => runSupportAction("draft_summary")}
          />

          <SupportButton
            label="Create reflection prompt"
            loadingLabel="Preparing…"
            isLoading={workingAction === "reflection_prompt"}
            disabled={Boolean(workingAction)}
            onClick={() => runSupportAction("reflection_prompt")}
          />
        </div>
      </section>

      <CoachingSupportDrawer
        result={supportResult}
        onAddToNotes={onAddToNotes}
        onClose={() => setSupportResult(null)}
      />
    </>
  );
}

function SupportButton({
  label,
  loadingLabel,
  isLoading,
  disabled,
  onClick,
}: {
  label: string;
  loadingLabel: string;
  isLoading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={isLoading}
      onClick={onClick}
    >
      {isLoading ? loadingLabel : label}
    </button>
  );
}
