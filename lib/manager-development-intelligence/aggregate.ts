/**
 * Distinct-Manager aggregation and Lead-safe view construction.
 */

import {
  MANAGER_DEVELOPMENT_INSUFFICIENT_COPY,
  MANAGER_DEVELOPMENT_PRIVACY_NOTE,
  MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD,
  type ManagerDevelopmentIntelligenceStatus,
  type ManagerDevelopmentPatternStrength,
} from "@/lib/manager-development-intelligence/constants";
import {
  managerDevelopmentThemeLabel,
  type ManagerDevelopmentDerivedSignal,
} from "@/lib/manager-development-intelligence/derive-theme";
import { organisationalNextStepForTheme } from "@/lib/manager-development-intelligence/next-step";

export type ManagerDevelopmentPatternView = {
  themeKey: string;
  themeLabel: string;
  strength: ManagerDevelopmentPatternStrength;
};

export type ManagerDevelopmentIntelligenceView = {
  status: ManagerDevelopmentIntelligenceStatus;
  privacyNote: string;
  readiness: {
    /** True when the organisation has at least 5 active Manager members. */
    sufficientManagerPopulation: boolean;
  };
  patterns: ManagerDevelopmentPatternView[];
  nextStep: { title: string; suggestion: string } | null;
  message: string | null;
};

type ThemeBucket = {
  themeKey: string;
  managers: Set<string>;
  modalities: Set<string>;
};

export function aggregateManagerDevelopmentSignals(input: {
  signals: ManagerDevelopmentDerivedSignal[];
  activeManagerPopulation: number;
  privacyThreshold?: number;
}): ManagerDevelopmentIntelligenceView {
  const threshold =
    input.privacyThreshold ?? MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD;
  const sufficientManagerPopulation =
    input.activeManagerPopulation >= threshold;

  const buckets = new Map<string, ThemeBucket>();
  for (const signal of input.signals) {
    const managerId = signal.managerUserId.trim();
    const themeKey = signal.themeKey.trim();
    if (!managerId || !themeKey) continue;
    const existing = buckets.get(themeKey);
    if (existing) {
      existing.managers.add(managerId);
      existing.modalities.add(signal.modality);
      continue;
    }
    buckets.set(themeKey, {
      themeKey,
      managers: new Set([managerId]),
      modalities: new Set([signal.modality]),
    });
  }

  const patterns: ManagerDevelopmentPatternView[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.managers.size < threshold) continue;
    const label = managerDevelopmentThemeLabel(bucket.themeKey);
    if (!label) continue;
    patterns.push({
      themeKey: bucket.themeKey,
      themeLabel: label,
      strength: resolveStrength(bucket.modalities.size),
    });
  }

  patterns.sort((a, b) => a.themeLabel.localeCompare(b.themeLabel));

  const status: ManagerDevelopmentIntelligenceStatus =
    patterns.length > 0 ? "patterns_available" : "insufficient_evidence";

  const primary = patterns[0] ?? null;
  const nextStep =
    primary != null ? organisationalNextStepForTheme(primary.themeKey) : null;

  return {
    status,
    privacyNote: MANAGER_DEVELOPMENT_PRIVACY_NOTE,
    readiness: { sufficientManagerPopulation },
    patterns,
    nextStep,
    message: status === "insufficient_evidence"
      ? MANAGER_DEVELOPMENT_INSUFFICIENT_COPY
      : null,
  };
}

/**
 * Privacy eligibility is already gated at >= 5 Managers.
 * With a single modality (focus), strength remains Emerging.
 * Developing requires corroboration across more than one safe modality.
 */
function resolveStrength(
  modalityCount: number
): ManagerDevelopmentPatternStrength {
  if (modalityCount >= 2) return "developing";
  return "emerging";
}

/** Test helpers — never used by Lead API responses. */
export function distinctManagerCountForTheme(
  signals: ManagerDevelopmentDerivedSignal[],
  themeKey: string
): number {
  const managers = new Set<string>();
  for (const signal of signals) {
    if (signal.themeKey === themeKey) {
      managers.add(signal.managerUserId);
    }
  }
  return managers.size;
}
