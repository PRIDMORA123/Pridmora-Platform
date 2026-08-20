import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import {
  assignRelationship,
  buildLeadAssignmentAdministrationPayload,
  endAssignment,
  loadLeadAssignmentAdminClients,
  SelfDevelopmentAssignmentBlockedError,
  transferPrimaryAssignment,
} from "@/lib/organisations/assignments";
import { parseAssignmentRole } from "@/lib/organisations/permissions";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(auth.context, "assignments.manage");
  if (denied) return denied;

  const organisationId = auth.context.organisation.organisationId;

  try {
    const [{ data: assignments, error }, { data: members }, clients] =
      await Promise.all([
        auth.context.supabase
          .from("relationship_assignments")
          .select("*")
          .eq("organisation_id", organisationId)
          .order("assigned_at", { ascending: false }),
        auth.context.supabase
          .from("organisation_memberships")
          .select("user_id, role, status, professional_role")
          .eq("organisation_id", organisationId)
          .eq("status", "active"),
        loadLeadAssignmentAdminClients(auth.context.supabase, organisationId),
      ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const userIds = (members ?? []).map(m => m.user_id as string);
    const { data: profiles } = await auth.context.supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    const nameByUser = new Map(
      (profiles ?? []).map(p => [p.id as string, p.full_name as string])
    );

    return NextResponse.json(
      buildLeadAssignmentAdministrationPayload({
        clients,
        assignments: (assignments ?? []) as Array<{
          id: string;
          client_id: string;
          user_id: string;
          assignment_role: string;
          status: string;
          assigned_at?: string | null;
          ended_at?: string | null;
        }>,
        members: (members ?? []) as Array<{
          user_id: string;
          role: string;
          professional_role?: string | null;
        }>,
        nameByUser,
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load assignments.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(auth.context, "assignments.manage");
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      action?: unknown;
      clientId?: unknown;
      userId?: unknown;
      assignmentRole?: unknown;
      assignmentId?: unknown;
    };

    const organisationId = auth.context.organisation.organisationId;
    const actorUserId = auth.context.user.id;

    if (body.action === "transfer") {
      const clientId = typeof body.clientId === "string" ? body.clientId : "";
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (!clientId || !userId) {
        return NextResponse.json(
          { error: "clientId and userId are required." },
          { status: 400 }
        );
      }
      await transferPrimaryAssignment({
        supabase: auth.context.supabase,
        organisationId,
        clientId,
        toUserId: userId,
        actorUserId,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "end") {
      const assignmentId =
        typeof body.assignmentId === "string" ? body.assignmentId : "";
      if (!assignmentId) {
        return NextResponse.json({ error: "assignmentId is required." }, { status: 400 });
      }
      await endAssignment({
        supabase: auth.context.supabase,
        organisationId,
        assignmentId,
        actorUserId,
      });
      return NextResponse.json({ ok: true });
    }

    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    const userId = typeof body.userId === "string" ? body.userId : "";
    const assignmentRole = parseAssignmentRole(body.assignmentRole) ?? "primary";
    if (!clientId || !userId) {
      return NextResponse.json(
        { error: "clientId and userId are required." },
        { status: 400 }
      );
    }

    await assignRelationship({
      supabase: auth.context.supabase,
      organisationId,
      clientId,
      userId,
      assignmentRole,
      actorUserId,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof SelfDevelopmentAssignmentBlockedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 }
      );
    }
    const message = error instanceof Error ? error.message : "Unable to update assignment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
