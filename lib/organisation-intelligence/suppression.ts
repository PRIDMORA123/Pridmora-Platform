import {
  INSUFFICIENT_EVIDENCE_COPY,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  SENSITIVE_THEME_PATTERNS,
} from "@/lib/organisation-intelligence/constants";

export function meetsPrivacyThreshold(
  relationshipCount: number,
  threshold: number = ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD
): boolean {
  return relationshipCount >= threshold;
}

export function suppressIfBelowThreshold<T extends { relationshipCount: number }>(
  items: T[],
  threshold: number = ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD
): Array<T & { suppressed: boolean }> {
  return items.map(item => ({
    ...item,
    suppressed: !meetsPrivacyThreshold(item.relationshipCount, threshold),
  }));
}

export function displaySuppressedValue(suppressed: boolean): string | null {
  return suppressed ? INSUFFICIENT_EVIDENCE_COPY : null;
}

/**
 * Detect themes that must not appear in organisation intelligence.
 * Returns true when the text looks like wellbeing, medical, disciplinary
 * or safeguarding content.
 */
export function isRestrictedSensitiveTheme(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  return SENSITIVE_THEME_PATTERNS.some(pattern => pattern.test(value));
}

export function privacyThresholdMessage(
  threshold: number = ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD
): string {
  return `Themes and subgroups are shown only when at least ${threshold} relationships contribute evidence.`;
}
