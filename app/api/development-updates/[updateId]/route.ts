import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  getDevelopmentUpdateById,
  saveEditedDevelopmentUpdate,
} from "@/lib/development-updates/repository";
import { proposedProfileChangesSchema } from "@/lib/development-updates/schema";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";
import { ZodError } from "zod";

type Params = { params: Promise<{ updateId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { updateId } = await params;
  try {
    const update = await getDevelopmentUpdateById(
      org.context.supabase,
      org.context.user.id,
      updateId
    );
    if (!update) {
      return notFoundOrForbidden();
    }

    const access = await requireAssignedPersonInOrganisation({
      clientId: update.clientId,
    });
    if (!access.ok) return access.response;

    const { data: client } = await access.context.supabase
      .from("clients")
      .select(
        "id, name, identity_mode, display_label, confidential_reference, ai_name_allowed, role, organisation"
      )
      .eq("id", update.clientId)
      .eq("coach_id", access.context.coachId)
      .maybeSingle();

    const { data: session } = await access.context.supabase
      .from("sessions")
      .select("id, session_date, display_date, title")
      .eq("id", update.sessionId)
      .eq("coach_id", access.context.coachId)
      .maybeSingle();

    const clientName = client
      ? getRelationshipDisplayName({
          name: client.name ?? "",
          identityMode: client.identity_mode,
          displayLabel: client.display_label,
          confidentialReference: client.confidential_reference,
          aiNameAllowed: client.ai_name_allowed,
          role: client.role,
          organisation: client.organisation,
        })
      : "Person";

    return NextResponse.json({
      update,
      clientName: clientName.trim() || "Person",
      sessionDate: session?.display_date || session?.session_date || "",
      sessionTitle: session?.title ?? "",
    });
  } catch (error) {
    return developmentUpdateErrorResponse(
      error,
      "Unable to load this development update."
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { updateId } = await params;
  let body: {
    conversationSummary?: string;
    editedChanges?: unknown;
    coachNote?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const existing = await getDevelopmentUpdateById(
      org.context.supabase,
      org.context.user.id,
      updateId
    );
    if (!existing) {
      return notFoundOrForbidden();
    }

    const access = await requireAssignedPersonInOrganisation({
      clientId: existing.clientId,
    });
    if (!access.ok) return access.response;

    const editedChanges = proposedProfileChangesSchema.parse(body.editedChanges ?? {});
    const update = await saveEditedDevelopmentUpdate(
      access.context.supabase,
      access.context.user.id,
      updateId,
      {
        conversationSummary: body.conversationSummary,
        editedChanges,
        coachNote: body.coachNote,
      }
    );
    return NextResponse.json({ update });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "The edited update could not be validated." },
        { status: 400 }
      );
    }
    return developmentUpdateErrorResponse(
      error,
      "Unable to save your edits to this development update."
    );
  }
}
