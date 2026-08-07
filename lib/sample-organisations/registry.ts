import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSampleOrganisationIntelligenceGenerationAvailable } from "@/lib/sample-organisations/organisation-intelligence";
import {
  validateSamplePack,
  type PackValidationResult,
} from "@/lib/sample-organisations/validate-pack";
import type {
  SamplePackKey,
  SamplePackSummary,
  ValidatedSamplePack,
} from "@/lib/sample-organisations/types";
import {
  DEFAULT_SAMPLE_PACK_KEY,
  LEGACY_CLEANUP_SAMPLE_PACK_KEYS,
} from "@/lib/sample-organisations/types";

const PACK_ROOT = join(process.cwd(), "sample-data");

type PackRegistration = {
  packKey: SamplePackKey;
  directory: string;
  /** When false, pack may still load for reset/remove of legacy installs. */
  installable: boolean;
};

/** Future packs are added here by registering another folder. */
const PACK_REGISTRY: PackRegistration[] = [
  {
    packKey: "averly-services-group",
    directory: "averly-services-group",
    installable: true,
  },
  {
    packKey: "northbridge-healthcare",
    directory: "northbridge-healthcare",
    // Retained for cleanup/reset of existing installations only.
    installable: false,
  },
];

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export function listRegisteredPackKeys(): SamplePackKey[] {
  return PACK_REGISTRY.map(pack => pack.packKey);
}

/** Packs that may be offered for new installations. */
export function listInstallablePackKeys(): SamplePackKey[] {
  return PACK_REGISTRY.filter(pack => pack.installable).map(pack => pack.packKey);
}

export function isInstallableSamplePack(packKey: string): boolean {
  const registration = getPackRegistration(packKey);
  return Boolean(registration?.installable);
}

export function isLegacyCleanupSamplePack(packKey: string): boolean {
  return (LEGACY_CLEANUP_SAMPLE_PACK_KEYS as readonly string[]).includes(packKey);
}

export function getDefaultSamplePackKey(): SamplePackKey {
  return DEFAULT_SAMPLE_PACK_KEY;
}

export function getPackRegistration(
  packKey: string
): PackRegistration | null {
  return PACK_REGISTRY.find(pack => pack.packKey === packKey) ?? null;
}

export function loadSamplePack(packKey: string): PackValidationResult {
  const registration = getPackRegistration(packKey);
  if (!registration) {
    return {
      ok: false,
      issues: [{ path: "packKey", message: "Unknown sample pack." }],
    };
  }

  const dir = join(PACK_ROOT, registration.directory);
  try {
    const manifest = readJson(join(dir, "manifest.json"));
    const organisation = readJson(join(dir, "organisation.json"));
    const relationships = readJson(join(dir, "relationships.json"));
    const assignments = readJson(join(dir, "assignments.json"));
    const sessions = readJson(join(dir, "sessions.json"));
    const actions = readJson(join(dir, "actions.json"));
    const developmentUpdates = readJson(join(dir, "development-updates.json"));
    const intelligenceItems = readJson(join(dir, "intelligence-items.json"));

    return validateSamplePack({
      manifest,
      organisation,
      relationships,
      assignments,
      sessions,
      actions,
      developmentUpdates,
      intelligenceItems,
    });
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          path: "pack",
          message:
            error instanceof Error
              ? "Sample pack could not be loaded."
              : "Sample pack could not be loaded.",
        },
      ],
    };
  }
}

export function requireSamplePack(packKey: string): ValidatedSamplePack {
  const result = loadSamplePack(packKey);
  if (!result.ok) {
    throw new Error(
      result.issues[0]?.message ?? "Sample pack validation failed."
    );
  }
  return result.pack;
}

export function toPackSummary(
  pack: ValidatedSamplePack,
  installation: SamplePackSummary["installation"]
): SamplePackSummary {
  const generationAvailable =
    isSampleOrganisationIntelligenceGenerationAvailable();
  const registration = getPackRegistration(pack.manifest.packKey);

  return {
    packKey: pack.manifest.packKey,
    packVersion: pack.manifest.packVersion,
    title: pack.manifest.title,
    summary: pack.manifest.summary,
    features: generationAvailable
      ? pack.manifest.features
      : pack.manifest.features.map(feature =>
          feature === "Organisation Intelligence included"
            ? "Organisation Intelligence when released"
            : feature
        ),
    estimatedSetupSeconds: pack.manifest.estimatedSetupSeconds,
    expectedCounts: pack.manifest.expectedCounts,
    privacyNote: pack.manifest.privacy.notes,
    installation,
    organisationIntelligenceGenerationAvailable: generationAvailable,
    installable: Boolean(registration?.installable),
  };
}
