export {
  MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD,
  MANAGER_DEVELOPMENT_PRIVACY_NOTE,
  MANAGER_DEVELOPMENT_INSUFFICIENT_COPY,
} from "@/lib/manager-development-intelligence/constants";

export type {
  ManagerDevelopmentPatternStrength,
  ManagerDevelopmentIntelligenceStatus,
} from "@/lib/manager-development-intelligence/constants";

export {
  deriveCanonicalThemeFromFocusTitle,
  deriveCanonicalThemeFromCapabilityKey,
  managerDevelopmentThemeLabel,
  isKnownManagerDevelopmentThemeKey,
} from "@/lib/manager-development-intelligence/derive-theme";

export type {
  ManagerDevelopmentDerivedSignal,
  ManagerDevelopmentSignalModality,
} from "@/lib/manager-development-intelligence/derive-theme";

export {
  aggregateManagerDevelopmentSignals,
  distinctManagerCountForTheme,
} from "@/lib/manager-development-intelligence/aggregate";

export type {
  ManagerDevelopmentIntelligenceView,
  ManagerDevelopmentPatternView,
} from "@/lib/manager-development-intelligence/aggregate";

export { organisationalNextStepForTheme } from "@/lib/manager-development-intelligence/next-step";

export {
  buildManagerDevelopmentIntelligence,
  toLeadSafeManagerDevelopmentPayload,
} from "@/lib/manager-development-intelligence/build";

export {
  listActiveManagerUserIds,
  listEligibleManagerSelfDevelopmentClients,
  loadManagerDevelopmentDerivedSignals,
} from "@/lib/manager-development-intelligence/load-signals";

export {
  LEAD_PRIVACY_BOUNDARY_COPY,
  LEAD_LENS_SEPARATION_COPY,
  LEAD_OVERVIEW_LENS_NOTE,
  STRENGTH_EXPLANATIONS,
  strengthDisplayLabel,
  themeDescriptionForKey,
} from "@/lib/manager-development-intelligence/ui-copy";
