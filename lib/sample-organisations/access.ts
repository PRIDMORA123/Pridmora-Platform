import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
  type OrganisationRequestContext,
} from "@/lib/organisations/current-organisation";

export async function requireSampleOrganisationManage(): Promise<
  | { ok: true; context: OrganisationRequestContext }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth;

  const denied = requireOrganisationPermission(
    auth.context,
    "sample_organisation.manage"
  );
  if (denied) return { ok: false, response: denied };

  return { ok: true, context: auth.context };
}

export function safeSampleError(
  message: string,
  status = 400,
  code?: string
): NextResponse {
  return NextResponse.json(
    code ? { error: message, code } : { error: message },
    { status }
  );
}
