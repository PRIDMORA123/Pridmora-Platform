export type {
  SamplePackKey,
  SamplePackManifest,
  SamplePackSummary,
  SampleInstallationView,
  SampleInstallationStatus,
  SampleInstallationStage,
  ValidatedSamplePack,
} from "@/lib/sample-organisations/types";

export {
  SAMPLE_STAGE_LABELS,
  SAMPLE_PROGRESS_STAGES,
  SAMPLE_PACK_KEYS,
  SAMPLE_ORGANISATION_SETUP_ESTIMATE,
} from "@/lib/sample-organisations/types";

export {
  listRegisteredPackKeys,
  loadSamplePack,
  requireSamplePack,
  toPackSummary,
} from "@/lib/sample-organisations/registry";

export { validateSamplePack } from "@/lib/sample-organisations/validate-pack";
export { buildInstallPlan } from "@/lib/sample-organisations/planner";
export {
  installSampleOrganisation,
  retrySampleOrganisationIntelligence,
} from "@/lib/sample-organisations/install";
export {
  resetSampleOrganisation,
  removeSampleOrganisation,
  openSampleOrganisation,
} from "@/lib/sample-organisations/reset-remove";
export {
  getInstallationById,
  getActiveInstallationForPack,
  verifyInstalledDataset,
} from "@/lib/sample-organisations/status";
export {
  progressPercentForStage,
  stageLabel,
  isActiveInstallationStatus,
} from "@/lib/sample-organisations/progress";
export {
  generateSampleOrganisationIntelligenceSnapshot,
  isSampleOrganisationIntelligenceGenerationAvailable,
  SAMPLE_ORGANISATION_INTELLIGENCE_GENERATION_AVAILABLE,
} from "@/lib/sample-organisations/organisation-intelligence";
export { requireSampleOrganisationManage } from "@/lib/sample-organisations/access";
export { canManageSampleOrganisation } from "@/lib/organisations/permissions";
