/**
 * Organisation pilot licence and practitioner seat control.
 *
 * Seat consumption (active members only):
 * - role "practitioner" always consumes a seat
 * - owner / administrator / oversight consume a seat only when they also have
 *   practitioner access (content-granting assignment) or any active
 *   relationship assignment
 * - viewer never consumes a seat
 * - deactivated members release seats; history is retained
 *
 * No billing, Stripe, or invoice automation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignmentRole,
  LicenceStatus,
  MembershipRole,
  OrganisationLicence,
  PractitionerSeatSummary,
} from "@/lib/organisations/types";

/** Roles that consume a seat only when practising / assigned. */
const CONDITIONAL_SEAT_ROLES: ReadonlySet<MembershipRole> = new Set([
  "owner",
  "administrator",
  "oversight",
]);

/** Assignment roles that grant practitioner (coaching content) access. */
const PRACTITIONER_ACCESS_ASSIGNMENT_ROLES: ReadonlySet<AssignmentRole> = new Set([
  "primary",
  "co_practitioner",
  "cover",
]);

export const NO_PRACTITIONER_SEAT_AVAILABLE_MESSAGE =
  "No practitioner seats available. Deactivate an existing practitioner or increase the organisation seat allocation before activating another.";

export const LICENCE_NOT_ACTIVE_MESSAGE =
  "This organisation licence is not active. Practitioner seats cannot be activated until the licence is restored.";

export type SeatMembershipRow = {
  userId: string;
  role: MembershipRole;
  status: string;
};

export type SeatAssignmentRow = {
  userId: string;
  assignmentRole: AssignmentRole;
  status: string;
};

export function isLicenceUsable(status: LicenceStatus): boolean {
  return status === "active" || status === "trial";
}

/**
 * Whether an active member currently consumes a practitioner seat.
 */
export function memberConsumesPractitionerSeat(input: {
  role: MembershipRole;
  status: string;
  hasPractitionerAccess: boolean;
  hasActiveRelationshipAssignment: boolean;
}): boolean {
  if (input.status !== "active") return false;

  if (input.role === "practitioner") return true;

  if (CONDITIONAL_SEAT_ROLES.has(input.role)) {
    return (
      input.hasPractitionerAccess || input.hasActiveRelationshipAssignment
    );
  }

  return false;
}

export function wouldMembershipConsumeSeat(input: {
  role: MembershipRole;
  status: string;
  /** True when the member already has (or will gain) an active assignment. */
  hasActiveRelationshipAssignment?: boolean;
  /** True when they have a content-granting assignment. */
  hasPractitionerAccess?: boolean;
}): boolean {
  return memberConsumesPractitionerSeat({
    role: input.role,
    status: input.status,
    hasPractitionerAccess: input.hasPractitionerAccess ?? false,
    hasActiveRelationshipAssignment:
      input.hasActiveRelationshipAssignment ?? false,
  });
}

/**
 * Distinct active members who currently consume a practitioner seat.
 */
export function countPractitionerSeatsInUse(
  memberships: SeatMembershipRow[],
  assignments: SeatAssignmentRow[]
): number {
  const activeAssignmentsByUser = new Map<
    string,
    { anyActive: boolean; practitionerAccess: boolean }
  >();

  for (const row of assignments) {
    if (row.status !== "active") continue;
    const current = activeAssignmentsByUser.get(row.userId) ?? {
      anyActive: false,
      practitionerAccess: false,
    };
    current.anyActive = true;
    if (PRACTITIONER_ACCESS_ASSIGNMENT_ROLES.has(row.assignmentRole)) {
      current.practitionerAccess = true;
    }
    activeAssignmentsByUser.set(row.userId, current);
  }

  const consuming = new Set<string>();
  for (const member of memberships) {
    const assignmentState = activeAssignmentsByUser.get(member.userId);
    if (
      memberConsumesPractitionerSeat({
        role: member.role,
        status: member.status,
        hasPractitionerAccess: assignmentState?.practitionerAccess ?? false,
        hasActiveRelationshipAssignment: assignmentState?.anyActive ?? false,
      })
    ) {
      consuming.add(member.userId);
    }
  }

  return consuming.size;
}

export function buildPractitionerSeatSummary(input: {
  seatsPurchased: number;
  seatsInUse: number;
}): PractitionerSeatSummary {
  const seatsPurchased = Math.max(0, Math.floor(input.seatsPurchased));
  const seatsInUse = Math.max(0, Math.floor(input.seatsInUse));
  const seatsAvailable = Math.max(0, seatsPurchased - seatsInUse);
  return {
    seatsPurchased,
    seatsInUse,
    seatsAvailable,
  };
}

export function formatSeatsInUseLabel(summary: PractitionerSeatSummary): string {
  return `${summary.seatsInUse} of ${summary.seatsPurchased} in use`;
}

/**
 * Guard for activating an additional seat-consuming member.
 * Returns an error message when blocked; null when allowed.
 */
export function assertPractitionerSeatAvailable(input: {
  licenceStatus: LicenceStatus;
  seatsPurchased: number;
  seatsInUse: number;
  /** True when this change would newly consume a seat. */
  wouldNewlyConsumeSeat: boolean;
}): string | null {
  if (!input.wouldNewlyConsumeSeat) return null;
  if (!isLicenceUsable(input.licenceStatus)) {
    return LICENCE_NOT_ACTIVE_MESSAGE;
  }
  const summary = buildPractitionerSeatSummary({
    seatsPurchased: input.seatsPurchased,
    seatsInUse: input.seatsInUse,
  });
  if (summary.seatsAvailable < 1) {
    return NO_PRACTITIONER_SEAT_AVAILABLE_MESSAGE;
  }
  return null;
}

type LicenceOrgRow = {
  licence_plan_name: string | null;
  practitioner_seats_purchased: number | null;
  licence_status: string | null;
  licence_starts_at: string | null;
  licence_ends_at: string | null;
};

export function mapOrganisationLicence(row: LicenceOrgRow): OrganisationLicence {
  const status = (row.licence_status ?? "active") as LicenceStatus;
  return {
    planName: row.licence_plan_name?.trim() || "Pilot",
    seatsPurchased: Math.max(0, Number(row.practitioner_seats_purchased ?? 0)),
    status: ["active", "trial", "expired", "suspended"].includes(status)
      ? status
      : "active",
    startsAt: row.licence_starts_at,
    endsAt: row.licence_ends_at,
  };
}

export async function loadOrganisationLicence(
  supabase: SupabaseClient,
  organisationId: string
): Promise<OrganisationLicence | null> {
  const { data, error } = await supabase
    .from("organisations")
    .select(
      "licence_plan_name, practitioner_seats_purchased, licence_status, licence_starts_at, licence_ends_at"
    )
    .eq("id", organisationId)
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapOrganisationLicence(data as LicenceOrgRow);
}

export async function loadPractitionerSeatUsage(
  supabase: SupabaseClient,
  organisationId: string
): Promise<{
  licence: OrganisationLicence;
  summary: PractitionerSeatSummary;
  memberships: SeatMembershipRow[];
  assignments: SeatAssignmentRow[];
}> {
  const licence = await loadOrganisationLicence(supabase, organisationId);
  if (!licence) {
    // Pre-migration fallback: treat as a single-seat pilot so product flows continue.
    const fallback: OrganisationLicence = {
      planName: "Pilot",
      seatsPurchased: 1,
      status: "active",
      startsAt: null,
      endsAt: null,
    };
    return {
      licence: fallback,
      summary: buildPractitionerSeatSummary({
        seatsPurchased: fallback.seatsPurchased,
        seatsInUse: 0,
      }),
      memberships: [],
      assignments: [],
    };
  }

  const [{ data: memberships, error: membershipError }, { data: assignments, error: assignmentError }] =
    await Promise.all([
      supabase
        .from("organisation_memberships")
        .select("user_id, role, status")
        .eq("organisation_id", organisationId),
      supabase
        .from("relationship_assignments")
        .select("user_id, assignment_role, status")
        .eq("organisation_id", organisationId),
    ]);

  if (membershipError) throw new Error(membershipError.message);
  if (assignmentError) throw new Error(assignmentError.message);

  const membershipRows: SeatMembershipRow[] = (memberships ?? []).map(row => ({
    userId: row.user_id as string,
    role: row.role as MembershipRole,
    status: row.status as string,
  }));

  const assignmentRows: SeatAssignmentRow[] = (assignments ?? []).map(row => ({
    userId: row.user_id as string,
    assignmentRole: row.assignment_role as AssignmentRole,
    status: row.status as string,
  }));

  const seatsInUse = countPractitionerSeatsInUse(membershipRows, assignmentRows);
  return {
    licence,
    summary: buildPractitionerSeatSummary({
      seatsPurchased: licence.seatsPurchased,
      seatsInUse,
    }),
    memberships: membershipRows,
    assignments: assignmentRows,
  };
}

/**
 * Whether assigning a relationship to this user would newly consume a seat.
 */
export function assignmentWouldNewlyConsumeSeat(input: {
  role: MembershipRole;
  status: string;
  alreadyConsumesSeat: boolean;
}): boolean {
  if (input.alreadyConsumesSeat) return false;
  if (input.status !== "active") return false;
  if (input.role === "practitioner") return false; // already consuming without assignment
  if (!CONDITIONAL_SEAT_ROLES.has(input.role)) return false;
  return true;
}

export function memberAlreadyConsumesSeat(
  userId: string,
  memberships: SeatMembershipRow[],
  assignments: SeatAssignmentRow[]
): boolean {
  const member = memberships.find(m => m.userId === userId);
  if (!member) return false;

  let anyActive = false;
  let practitionerAccess = false;
  for (const row of assignments) {
    if (row.userId !== userId || row.status !== "active") continue;
    anyActive = true;
    if (PRACTITIONER_ACCESS_ASSIGNMENT_ROLES.has(row.assignmentRole)) {
      practitionerAccess = true;
    }
  }

  return memberConsumesPractitionerSeat({
    role: member.role,
    status: member.status,
    hasPractitionerAccess: practitionerAccess,
    hasActiveRelationshipAssignment: anyActive,
  });
}
