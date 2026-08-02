/**
 * Shared organisation-workspace formatting helpers.
 * Prefer UK-readable dates and title-cased visible labels.
 */

import {
  ASSIGNMENT_ROLES,
  MEMBERSHIP_ROLE_LABELS,
  PROFESSIONAL_ROLES,
  type AssignmentRole,
  type MembershipRole,
  type ProfessionalRole,
} from "@/lib/organisations/types";

/** Compact UK metadata date — e.g. "2 Aug 2026". */
export function formatOrganisationDate(
  value: string | null | undefined
): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(parsed));
}

/** Long UK date — e.g. "2 August 2026". */
export function formatOrganisationDateLong(
  value: string | null | undefined
): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(parsed));
}

export const PROFESSIONAL_ROLE_LABELS: Record<ProfessionalRole, string> = {
  coach: "Coach",
  manager: "Manager",
  mentor: "Mentor",
  facilitator: "Facilitator",
  supervisor: "Supervisor",
  other: "Other",
};

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  primary: "Primary",
  co_practitioner: "Co-practitioner",
  cover: "Cover",
  supervisor: "Supervisor",
};

export const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  invited: "Invited",
  deactivated: "Deactivated",
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  ended: "Ended",
};

/** Title-case a known professional role, or a generic snake/kebab value. */
export function formatProfessionalRoleLabel(
  value: string | null | undefined
): string {
  if (!value) return "—";
  if ((PROFESSIONAL_ROLES as readonly string[]).includes(value)) {
    return PROFESSIONAL_ROLE_LABELS[value as ProfessionalRole];
  }
  return titleCaseWords(value);
}

export function formatAssignmentRoleLabel(
  value: string | null | undefined
): string {
  if (!value) return "—";
  if ((ASSIGNMENT_ROLES as readonly string[]).includes(value)) {
    return ASSIGNMENT_ROLE_LABELS[value as AssignmentRole];
  }
  return titleCaseWords(value);
}

export function formatMembershipRoleLabel(role: MembershipRole): string {
  return MEMBERSHIP_ROLE_LABELS[role];
}

export function formatMembershipStatusLabel(status: string): string {
  return MEMBERSHIP_STATUS_LABELS[status] ?? titleCaseWords(status);
}

export function formatAssignmentStatusLabel(status: string): string {
  return ASSIGNMENT_STATUS_LABELS[status] ?? titleCaseWords(status);
}

export function titleCaseWords(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Initials from a display name — e.g. "Barry Pridmore" → "BP". */
export function organisationInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function retentionPolicyDisplayLabel(value: string | null | undefined): {
  label: string;
  readOnly: boolean;
} {
  const normalised = (value ?? "standard").trim().toLowerCase();
  if (normalised === "standard" || normalised === "standard retention policy") {
    return { label: "Standard retention policy", readOnly: true };
  }
  return { label: titleCaseWords(value ?? "standard"), readOnly: false };
}
