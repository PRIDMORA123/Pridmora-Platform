import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  type AuthenticatedRequest,
} from "@/lib/auth/session";
import {
  getPlatformOwnerForUser,
  isPlatformOwner,
  resolvePlatformOwner,
} from "@/lib/owner/platform-owner";

export type PlatformOwnerRequest = AuthenticatedRequest & {
  platformOwnerId: string;
};

export {
  getPlatformOwnerForUser,
  isPlatformOwner,
  resolvePlatformOwner,
};

/**
 * Require authenticated user who is an active platform_owner.
 * platform_owner is platform-scoped — never inferred from organisation membership.
 * A user may simultaneously be an organisation Manager and a platform_owner.
 */
export async function requirePlatformOwner(): Promise<
  | { ok: true; context: PlatformOwnerRequest }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth;

  const owner = await resolvePlatformOwner(
    auth.context.supabase,
    auth.context.user.id
  );

  if (!owner) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Owner Console access denied." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    context: {
      ...auth.context,
      platformOwnerId: owner.id,
    },
  };
}

export function ownerForbiddenResponse(): NextResponse {
  return NextResponse.json(
    { error: "Owner Console access denied." },
    { status: 403 }
  );
}

export function ownerUnavailableResponse(message = "Unable to complete request."): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function ownerValidationResponse(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 422 });
}
