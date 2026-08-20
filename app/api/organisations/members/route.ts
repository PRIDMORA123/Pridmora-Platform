import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import {
  canAssignRole,
  hasPermission,
  parseMembershipRole,
} from "@/lib/organisations/permissions";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import {
  assertPractitionerSeatAvailable,
  loadPractitionerSeatUsage,
  memberAlreadyConsumesSeat,
  wouldMembershipConsumeSeat,
} from "@/lib/organisations/licence";
import type { MembershipRole, ProfessionalRole } from "@/lib/organisations/types";
import { countActiveAssignedPeopleByUser } from "@/lib/organisations/assignments";
import { listSelfDevelopmentClientIdsForOrganisation } from "@/lib/organisation-intelligence/exclude-self-development";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const canManage = hasPermission(auth.context.organisation.role, "members.manage");
  const canView =
    canManage ||
    hasPermission(auth.context.organisation.role, "organisation.view_safe_oversight");
  if (!canView) {
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  }

  try {
    const organisationId = auth.context.organisation.organisationId;

    const { data: memberships, error } = await auth.context.supabase
      .from("organisation_memberships")
      .select(
        "id, organisation_id, user_id, role, professional_role, status, invited_by, invited_at, joined_at, deactivated_at, last_active_at, created_at, updated_at"
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const userIds = (memberships ?? []).map(m => m.user_id as string);
    const { data: profiles } = await auth.context.supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    const profileMap = new Map(
      (profiles ?? []).map(p => [p.id as string, p.full_name as string])
    );

    const { data: assignments } = await auth.context.supabase
      .from("relationship_assignments")
      .select("user_id, client_id")
      .eq("organisation_id", organisationId)
      .eq("status", "active");

    const selfDevelopmentIds = new Set(
      await listSelfDevelopmentClientIdsForOrganisation(
        auth.context.supabase,
        organisationId
      )
    );
    const assignmentCounts = countActiveAssignedPeopleByUser(
      (assignments ?? []) as Array<{ user_id: string; client_id: string }>,
      selfDevelopmentIds
    );

    const seatUsage = await loadPractitionerSeatUsage(
      auth.context.supabase,
      organisationId
    );

    // Emails via auth are not available through RLS profiles — return safe placeholders.
    // Member email is known at invite time; for existing members we expose profile name only.
    const members = (memberships ?? []).map(m => ({
      id: m.id,
      userId: m.user_id,
      name: profileMap.get(m.user_id as string) || "Member",
      email: null as string | null,
      role: m.role,
      professionalRole: m.professional_role,
      status: m.status,
      assignedRelationshipsCount: assignmentCounts.get(m.user_id as string) ?? 0,
      lastActiveAt: m.last_active_at,
      joinedAt: m.joined_at,
      deactivatedAt: m.deactivated_at,
    }));

    return NextResponse.json({
      members,
      canManage,
      seats: {
        ...seatUsage.summary,
        label: `${seatUsage.summary.seatsInUse} of ${seatUsage.summary.seatsPurchased} in use`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load members.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(auth.context, "members.manage");
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      membershipId?: unknown;
      role?: unknown;
      status?: unknown;
      professionalRole?: unknown;
    };

    const membershipId =
      typeof body.membershipId === "string" ? body.membershipId : "";
    if (!membershipId) {
      return NextResponse.json({ error: "membershipId is required." }, { status: 400 });
    }

    const organisationId = auth.context.organisation.organisationId;

    const { data: existing, error: loadError } = await auth.context.supabase
      .from("organisation_memberships")
      .select("*")
      .eq("id", membershipId)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!existing) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    // Prevent self role escalation / owner demotion edge cases.
    if (existing.user_id === auth.context.user.id && body.role) {
      return NextResponse.json(
        { error: "You cannot change your own membership role." },
        { status: 403 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    let nextRole = existing.role as MembershipRole;
    if (body.role !== undefined) {
      const role = parseMembershipRole(body.role);
      if (!role || !canAssignRole(auth.context.organisation.role, role)) {
        return NextResponse.json({ error: "Cannot assign that role." }, { status: 403 });
      }
      if (existing.role === "owner" && auth.context.organisation.role !== "owner") {
        return NextResponse.json({ error: "Cannot modify the owner." }, { status: 403 });
      }
      updates.role = role;
      nextRole = role;
    }

    if (body.professionalRole !== undefined) {
      updates.professional_role =
        typeof body.professionalRole === "string" ? body.professionalRole : null;
    }

    let nextStatus = existing.status as string;
    if (body.status === "deactivated") {
      const deactivateDenied = requireOrganisationPermission(
        auth.context,
        "members.deactivate"
      );
      if (deactivateDenied) return deactivateDenied;
      updates.status = "deactivated";
      updates.deactivated_at = new Date().toISOString();
      nextStatus = "deactivated";
    } else if (body.status === "active") {
      updates.status = "active";
      updates.deactivated_at = null;
      nextStatus = "active";
    }

    // Seat enforcement: block role→practitioner or reactivation when no seat remains.
    const seatUsage = await loadPractitionerSeatUsage(
      auth.context.supabase,
      organisationId
    );
    const currentlyConsumes = memberAlreadyConsumesSeat(
      existing.user_id as string,
      seatUsage.memberships,
      seatUsage.assignments
    );
    const hasActiveAssignment = seatUsage.assignments.some(
      row => row.userId === existing.user_id && row.status === "active"
    );
    const hasPractitionerAccess = seatUsage.assignments.some(
      row =>
        row.userId === existing.user_id &&
        row.status === "active" &&
        (row.assignmentRole === "primary" ||
          row.assignmentRole === "co_practitioner" ||
          row.assignmentRole === "cover")
    );
    const wouldConsume = wouldMembershipConsumeSeat({
      role: nextRole,
      status: nextStatus,
      hasActiveRelationshipAssignment: hasActiveAssignment,
      hasPractitionerAccess,
    });
    const seatBlock = assertPractitionerSeatAvailable({
      licenceStatus: seatUsage.licence.status,
      seatsPurchased: seatUsage.licence.seatsPurchased,
      seatsInUse: seatUsage.summary.seatsInUse,
      wouldNewlyConsumeSeat: wouldConsume && !currentlyConsumes,
    });
    if (seatBlock) {
      return NextResponse.json({ error: seatBlock }, { status: 409 });
    }

    const { error: updateError } = await auth.context.supabase
      .from("organisation_memberships")
      .update(updates)
      .eq("id", membershipId)
      .eq("organisation_id", organisationId);

    if (updateError) throw new Error(updateError.message);

    await writeOrganisationAudit({
      supabase: auth.context.supabase,
      organisationId,
      actorUserId: auth.context.user.id,
      action:
        body.status === "deactivated"
          ? "membership_deactivated"
          : body.status === "active"
            ? "membership_reactivated"
            : "role_changed",
      entityType: "organisation_membership",
      entityId: membershipId,
      metadata: {
        role: updates.role as MembershipRole | undefined,
        status: updates.status as string | undefined,
        professionalRole: updates.professional_role as ProfessionalRole | null | undefined,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update member.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
