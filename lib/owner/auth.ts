import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  requireAuthenticatedUser,
  type AuthenticatedRequest,
} from "@/lib/auth/session";

export type PlatformOwnerRequest = AuthenticatedRequest & {
  platformOwnerId: string;
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

/**
 * True when the authenticated user has an active platform_owners row.
 * Organisation membership (including Manager) is irrelevant and never checked.
 */
export async function isPlatformOwner(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const owner = await resolvePlatformOwner(supabase, userId);
  return owner !== null;
}

export async function resolvePlatformOwner(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; userId: string } | null> {
  if (!userId) return null;

  try {
    // Prefer SECURITY DEFINER RPC — independent of organisation membership / RLS quirks.
    const rpcNamed = await supabase.rpc("is_platform_owner", {
      p_user_id: userId,
    });
    if (!rpcNamed.error && rpcNamed.data === true) {
      const row = await readPlatformOwnerRow(supabase, userId);
      return row ?? { id: userId, userId };
    }

    // Default-arg form uses auth.uid() inside the function.
    if (rpcNamed.error) {
      const rpcDefault = await supabase.rpc("is_platform_owner");
      if (!rpcDefault.error && rpcDefault.data === true) {
        const row = await readPlatformOwnerRow(supabase, userId);
        return row ?? { id: userId, userId };
      }
    }

    // Direct table read: policy allows a user to select their own platform_owners row.
    // Organisation Manager membership is never consulted.
    return readPlatformOwnerRow(supabase, userId);
  } catch {
    return null;
  }
}

async function readPlatformOwnerRow(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; userId: string } | null> {
  const { data, error } = await supabase
    .from("platform_owners")
    .select("id, user_id, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data?.id) return null;
  return { id: data.id as string, userId: data.user_id as string };
}

export async function getPlatformOwnerForUser(
  supabase: SupabaseClient,
  user: User
): Promise<{ id: string; userId: string } | null> {
  return resolvePlatformOwner(supabase, user.id);
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
