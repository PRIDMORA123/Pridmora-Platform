/**
 * Orchestrates Manager Development Intelligence for authorised Lead callers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateManagerDevelopmentSignals } from "@/lib/manager-development-intelligence/aggregate";
import type { ManagerDevelopmentIntelligenceView } from "@/lib/manager-development-intelligence/aggregate";
import { loadManagerDevelopmentDerivedSignals } from "@/lib/manager-development-intelligence/load-signals";

export async function buildManagerDevelopmentIntelligence(input: {
  /** Privileged server client used only after permission checks. */
  supabase: SupabaseClient;
  organisationId: string;
}): Promise<ManagerDevelopmentIntelligenceView> {
  const organisationId = input.organisationId.trim();
  if (!organisationId) {
    throw new Error("Organisation is required.");
  }

  const loaded = await loadManagerDevelopmentDerivedSignals({
    supabase: input.supabase,
    organisationId,
    includeEvidenceCapabilities: true,
  });

  return aggregateManagerDevelopmentSignals({
    signals: loaded.signals,
    activeManagerPopulation: loaded.activeManagerPopulation,
  });
}

/**
 * Strip any accidental internal fields before JSON serialisation.
 * Defence-in-depth — aggregate view should already be Lead-safe.
 */
export function toLeadSafeManagerDevelopmentPayload(
  view: ManagerDevelopmentIntelligenceView
): ManagerDevelopmentIntelligenceView {
  return {
    status: view.status,
    privacyNote: view.privacyNote,
    readiness: {
      sufficientManagerPopulation: Boolean(
        view.readiness.sufficientManagerPopulation
      ),
    },
    patterns: view.patterns.map(pattern => ({
      themeKey: pattern.themeKey,
      themeLabel: pattern.themeLabel,
      strength: pattern.strength,
    })),
    nextStep: view.nextStep
      ? {
          title: view.nextStep.title,
          suggestion: view.nextStep.suggestion,
        }
      : null,
    message: view.message,
  };
}
