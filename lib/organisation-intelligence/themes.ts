import {
  KNOWN_THEME_CATALOGUE,
  type FoundationKey,
  type TrendDirection,
} from "@/lib/organisation-intelligence/constants";
import { calculateConfidenceLevel } from "@/lib/organisation-intelligence/confidence";
import { isRestrictedSensitiveTheme } from "@/lib/organisation-intelligence/suppression";
import { meetsPrivacyThreshold } from "@/lib/organisation-intelligence/suppression";
import type {
  ThemeCandidate,
  ThemeView,
} from "@/lib/organisation-intelligence/types";

export type NormalisedTheme = {
  key: string;
  label: string;
  foundations: FoundationKey[];
  restricted: boolean;
  known: boolean;
};

export function normaliseThemeKey(raw: string): NormalisedTheme {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (isRestrictedSensitiveTheme(cleaned)) {
    return {
      key: "restricted",
      label: "Restricted",
      foundations: [],
      restricted: true,
      known: false,
    };
  }

  for (const entry of KNOWN_THEME_CATALOGUE) {
    if (
      entry.key === cleaned ||
      entry.aliases.some(alias => alias === cleaned || cleaned.includes(alias))
    ) {
      return {
        key: entry.key,
        label: entry.label,
        foundations: [...entry.foundations],
        restricted: false,
        known: true,
      };
    }
  }

  // Unknown free-text titles are kept only as a hashed-style slug for
  // aggregation maths, then suppressed from display unless they map later.
  const slug = cleaned
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 48);

  return {
    key: slug || "unclassified",
    label: titleCase(cleaned).slice(0, 60) || "Unclassified",
    foundations: [],
    restricted: false,
    known: false,
  };
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, char => char.toUpperCase());
}

type ThemeBucket = {
  themeKey: string;
  themeLabel: string;
  foundations: FoundationKey[];
  known: boolean;
  relationshipIds: Set<string>;
  evidenceCount: number;
  sourceTypes: Set<string>;
};

function buildBuckets(candidates: ThemeCandidate[]): {
  buckets: Map<string, ThemeBucket>;
  restrictedExcluded: number;
} {
  const buckets = new Map<string, ThemeBucket>();
  let restrictedExcluded = 0;

  for (const candidate of candidates) {
    const normalised = normaliseThemeKey(candidate.themeKey);
    if (normalised.restricted) {
      restrictedExcluded += 1;
      continue;
    }

    const existing = buckets.get(normalised.key);
    if (existing) {
      existing.relationshipIds.add(candidate.relationshipId);
      existing.evidenceCount += 1;
      existing.sourceTypes.add(candidate.sourceType);
      continue;
    }

    buckets.set(normalised.key, {
      themeKey: normalised.key,
      themeLabel: normalised.label,
      foundations: normalised.foundations,
      known: normalised.known,
      relationshipIds: new Set([candidate.relationshipId]),
      evidenceCount: 1,
      sourceTypes: new Set([candidate.sourceType]),
    });
  }

  return { buckets, restrictedExcluded };
}

function directionFromCounts(
  currentRelationships: number,
  previousRelationships: number,
  comparisonAvailable: boolean
): TrendDirection {
  if (!comparisonAvailable) return "insufficient_evidence";
  if (currentRelationships === 0 && previousRelationships === 0) {
    return "insufficient_evidence";
  }
  const delta = currentRelationships - previousRelationships;
  if (Math.abs(delta) <= 1) return "stable";
  return delta > 1 ? "strengthening" : "requiring_attention";
}

export function aggregateThemes(input: {
  current: ThemeCandidate[];
  previous: ThemeCandidate[];
  hasEarlierPeriodActivity: boolean;
  threshold: number;
}): { themes: ThemeView[]; restrictedEvidenceExcluded: boolean } {
  const current = buildBuckets(input.current);
  const previous = buildBuckets(input.previous);
  const themes: ThemeView[] = [];

  for (const bucket of current.buckets.values()) {
    const relationshipCount = bucket.relationshipIds.size;
    const previousBucket = previous.buckets.get(bucket.themeKey);
    const previousRelationships = previousBucket?.relationshipIds.size ?? 0;
    const suppressed = !meetsPrivacyThreshold(
      relationshipCount,
      input.threshold
    );
    const direction = suppressed
      ? "insufficient_evidence"
      : directionFromCounts(
          relationshipCount,
          previousRelationships,
          input.hasEarlierPeriodActivity
        );

    const confidenceLevel = calculateConfidenceLevel({
      evidenceCount: bucket.evidenceCount,
      relationshipCount,
      sourceTypeCount: bucket.sourceTypes.size,
      consistentDirection: direction === "strengthening" || direction === "stable",
      multiPeriod: input.hasEarlierPeriodActivity && previousRelationships > 0,
      threshold: input.threshold,
    });

    themes.push({
      themeKey: bucket.themeKey,
      themeLabel: bucket.themeLabel,
      evidenceCount: bucket.evidenceCount,
      relationshipCount,
      direction,
      confidenceLevel,
      summary: suppressed
        ? null
        : `Evidence suggests ${bucket.themeLabel.toLowerCase()} is appearing across ${relationshipCount} relationships.`,
      suppressed,
      relatedCapabilities: bucket.foundations,
      evidenceTypes: Array.from(bucket.sourceTypes).sort(),
      metadata: {
        known: bucket.known,
        previousRelationshipCount: previousRelationships,
      },
    });
  }

  themes.sort((a, b) => {
    if (a.suppressed !== b.suppressed) return a.suppressed ? 1 : -1;
    if (b.relationshipCount !== a.relationshipCount) {
      return b.relationshipCount - a.relationshipCount;
    }
    return b.evidenceCount - a.evidenceCount;
  });

  return {
    themes,
    restrictedEvidenceExcluded:
      current.restrictedExcluded > 0 || previous.restrictedExcluded > 0,
  };
}
