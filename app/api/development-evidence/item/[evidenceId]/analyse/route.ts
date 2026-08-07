import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { analyseEvidenceDocument } from "@/lib/development-evidence";
import { getEvidenceById } from "@/lib/development-evidence/repository";

type Params = { params: Promise<{ evidenceId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { evidenceId } = await params;
  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    force = Boolean(body.force);
  } catch {
    force = false;
  }

  try {
    const detail = await getEvidenceById(
      auth.context.supabase,
      auth.context.user.id,
      evidenceId
    );

    const { data: client, error } = await auth.context.supabase
      .from("clients")
      .select(
        "id, name, role, organisation, identity_mode, display_label, confidential_reference, ai_name_allowed"
      )
      .eq("id", detail.evidence.clientId)
      .maybeSingle();

    if (error || !client) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    const result = await analyseEvidenceDocument({
      supabase: auth.context.supabase,
      userId: auth.context.user.id,
      evidenceId,
      client: {
        name: String(client.name ?? ""),
        role: (client.role as string | null) ?? null,
        organisation: (client.organisation as string | null) ?? null,
        identityMode: (client.identity_mode as string | null) ?? "standard",
        displayLabel: (client.display_label as string | null) ?? null,
        confidentialReference:
          (client.confidential_reference as string | null) ?? null,
        aiNameAllowed: Boolean(client.ai_name_allowed),
      },
      // Private identity deliberately omitted — never load for AI analysis.
      privateIdentity: null,
      force,
    });

    const refreshed = await getEvidenceById(
      auth.context.supabase,
      auth.context.user.id,
      evidenceId
    );

    return NextResponse.json({
      ...result,
      evidence: refreshed.evidence,
      observations: refreshed.observations,
    });
  } catch (error) {
    console.error(
      "Evidence analyse error:",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to analyse evidence.",
      },
      { status: 400 }
    );
  }
}
