import type {
  SampleInstallationStage,
  SampleInstallationStatus,
} from "@/lib/sample-organisations/types";
import {
  SAMPLE_INSTALLATION_STAGES,
  SAMPLE_INSTALLATION_STATUSES,
  SAMPLE_PROGRESS_STAGES,
  SAMPLE_STAGE_LABELS,
} from "@/lib/sample-organisations/types";

export function isSampleInstallationStatus(
  value: unknown
): value is SampleInstallationStatus {
  return (
    typeof value === "string" &&
    (SAMPLE_INSTALLATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isSampleInstallationStage(
  value: unknown
): value is SampleInstallationStage {
  return (
    typeof value === "string" &&
    (SAMPLE_INSTALLATION_STAGES as readonly string[]).includes(value)
  );
}

export function stageLabel(stage: SampleInstallationStage): string {
  return SAMPLE_STAGE_LABELS[stage];
}

export function progressPercentForStage(
  stage: SampleInstallationStage,
  status: SampleInstallationStatus
): number {
  if (status === "ready") return 100;
  if (status === "failed" || status === "removed") return 0;
  const index = SAMPLE_PROGRESS_STAGES.indexOf(stage);
  if (index < 0) return 0;
  return Math.round(((index + 1) / SAMPLE_PROGRESS_STAGES.length) * 100);
}

export function isActiveInstallationStatus(
  status: SampleInstallationStatus
): boolean {
  return (
    status === "installing" ||
    status === "ready" ||
    status === "resetting" ||
    status === "removing" ||
    status === "intelligence_pending"
  );
}
