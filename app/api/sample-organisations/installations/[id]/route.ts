import { NextResponse } from "next/server";
import {
  getInstallationById,
  requireSampleOrganisationManage,
} from "@/lib/sample-organisations";
import { safeSampleError } from "@/lib/sample-organisations/access";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireSampleOrganisationManage();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return safeSampleError("Installation not found.", 404, "NOT_FOUND");
  }

  const installation = await getInstallationById(auth.context.supabase, id);
  if (!installation) {
    return safeSampleError("Installation not found.", 404, "NOT_FOUND");
  }

  // Cross-user isolation: only installer or sample-org manager (RLS also applies).
  if (
    installation.installedBy !== auth.context.user.id &&
    installation.organisationId !== auth.context.organisation.organisationId &&
    installation.sourceOrganisationId !==
      auth.context.organisation.organisationId
  ) {
    return safeSampleError("Installation not found.", 404, "NOT_FOUND");
  }

  return NextResponse.json({ installation });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireSampleOrganisationManage();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: { confirmation?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const { removeSampleOrganisation } = await import(
    "@/lib/sample-organisations/reset-remove"
  );
  const { checkSampleOrganisationRateLimit } = await import(
    "@/lib/sample-organisations/rate-limit"
  );

  const rate = checkSampleOrganisationRateLimit({
    userId: auth.context.user.id,
    action: "remove",
    limit: 3,
  });
  if (!rate.ok) {
    return safeSampleError("Please wait before trying again.", 429, "RATE_LIMITED");
  }

  const result = await removeSampleOrganisation({
    supabase: auth.context.supabase,
    userId: auth.context.user.id,
    installationId: id,
    confirmation: body.confirmation ?? "",
  });

  if (!result.ok) {
    const status =
      result.code === "CONFIRMATION_REQUIRED"
        ? 400
        : result.code === "NOT_FOUND"
          ? 404
          : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }

  // Return user to previous organisation preference when available.
  if (result.sourceOrganisationId) {
    const { setCurrentOrganisationPreference } = await import(
      "@/lib/organisations/repository"
    );
    await setCurrentOrganisationPreference(
      auth.context.supabase,
      auth.context.user.id,
      result.sourceOrganisationId
    );
  }

  return NextResponse.json({
    removed: true,
    sourceOrganisationId: result.sourceOrganisationId,
  });
}
