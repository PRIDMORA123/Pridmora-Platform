import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  buildDevelopmentIntelligenceEvidenceView,
  buildWhyThisPayload,
  listEvidenceForClient,
  writeEvidenceAudit,
} from "@/lib/development-evidence";

type Params = { params: Promise<{ clientId: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { clientId } = await params;
  const url = new URL(request.url);
  const insight = url.searchParams.get("insight");
  const whyEvidenceIds = url.searchParams.get("evidenceIds");

  try {
    const { data: client, error } = await auth.context.supabase
      .from("clients")
      .select("id, current_focus, organisation_id")
      .eq("id", clientId)
      .maybeSingle();

    if (error || !client) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    const records = await listEvidenceForClient(
      auth.context.supabase,
      auth.context.user.id,
      clientId
    );

    const frameworkLabels: Record<string, string[]> = {};
    const organisationId = client.organisation_id as string | null;
    if (organisationId) {
      const { data: frameworkCaps } = await auth.context.supabase
        .from("organisation_framework_capabilities")
        .select("label, pridmora_capability_key")
        .eq("organisation_id", organisationId);

      for (const row of frameworkCaps ?? []) {
        const key = row.pridmora_capability_key as string | null;
        if (!key) continue;
        const list = frameworkLabels[key] ?? [];
        list.push(String(row.label));
        frameworkLabels[key] = list;
      }
    }

    const view = buildDevelopmentIntelligenceEvidenceView({
      records,
      currentFocus: (client.current_focus as string | null) ?? null,
      organisationFrameworkLabelsByCapability: frameworkLabels,
    });

    if (insight && whyEvidenceIds) {
      const ids = whyEvidenceIds.split(",").filter(Boolean);
      const selected = records.filter(item => ids.includes(item.id));
      const whyThis = buildWhyThisPayload({
        insight,
        records: selected.length > 0 ? selected : records.filter(r => r.includeInIntelligence),
      });

      await writeEvidenceAudit({
        supabase: auth.context.supabase,
        organisationId,
        clientId,
        evidenceId: selected[0]?.id ?? null,
        actorUserId: auth.context.user.id,
        action: "intelligence_evidence_opened",
        metadata: {
          evidenceType: selected[0]?.evidenceType,
        },
      });

      return NextResponse.json({ view, whyThis });
    }

    return NextResponse.json({ view });
  } catch (error) {
    console.error(
      "Evidence intelligence error:",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "Unable to load development intelligence evidence view." },
      { status: 500 }
    );
  }
}
