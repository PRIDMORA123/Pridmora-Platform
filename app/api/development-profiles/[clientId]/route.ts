import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  ensureProfileOrEmpty,
  listDevelopmentUpdatesForClient,
} from "@/lib/development-updates/repository";
import { assertRelationshipOwnership } from "@/lib/relationship-scope";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";

type Params = { params: Promise<{ clientId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { clientId } = await params;
  const coachId = auth.context.user.id;

  try {
    const { data: client, error } = await auth.context.supabase
      .from("clients")
      .select(
        "id, name, current_focus, identity_mode, display_label, confidential_reference, ai_name_allowed, role, organisation"
      )
      .eq("id", clientId)
      .eq("coach_id", coachId)
      .maybeSingle();

    if (error || !client) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    const profile = await ensureProfileOrEmpty(
      auth.context.supabase,
      coachId,
      clientId,
      String(client.current_focus ?? "")
    );

    const updates = await listDevelopmentUpdatesForClient(
      auth.context.supabase,
      coachId,
      clientId
    );

    assertRelationshipOwnership(clientId, [profile, ...updates]);

    const pendingUpdate =
      updates.find(update => update.status === "ready_for_review") ?? null;

    return NextResponse.json({
      profile,
      pendingUpdate,
      updates,
      clientName: getRelationshipDisplayName({
        name: String(client.name ?? ""),
        identityMode: (client as { identity_mode?: string }).identity_mode,
        displayLabel: (client as { display_label?: string }).display_label,
        confidentialReference: (client as { confidential_reference?: string })
          .confidential_reference,
        aiNameAllowed: (client as { ai_name_allowed?: boolean }).ai_name_allowed,
        role: (client as { role?: string }).role,
        organisation: (client as { organisation?: string }).organisation,
      }),
      relationshipId: clientId,
      coachId,
    });
  } catch (error) {
    return developmentUpdateErrorResponse(
      error,
      "Unable to load the development profile."
    );
  }
}
