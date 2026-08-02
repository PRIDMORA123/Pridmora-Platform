import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  requireAuthenticatedUser,
  notFoundOrForbidden,
  type AuthenticatedRequest,
} from "@/lib/auth/session";
import {
  canAccessCoachingContent,
  canAccessPrivateNotes,
  hasPermission,
} from "@/lib/organisations/permissions";
import {
  getActiveAssignment,
  resolveOrganisationContext,
} from "@/lib/organisations/repository";
import type {
  OrganisationContext,
  OrganisationPermission,
  RelationshipAssignment,
} from "@/lib/organisations/types";

export type OrganisationRequestContext = AuthenticatedRequest & {
  organisation: OrganisationContext;
  /** Alias for practitioner identity — still equals auth user id. */
  coachId: string;
};

/**
 * Require authenticated user + active organisation membership.
 * For users with one organisation, selects it automatically.
 * Never trusts browser-supplied organisation IDs without membership checks.
 */
export async function requireOrganisationContext(options?: {
  preferredOrganisationId?: string | null;
}): Promise<
  | { ok: true; context: OrganisationRequestContext }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth;

  const resolved = await resolveOrganisationContext(
    auth.context.supabase,
    auth.context.user.id,
    options?.preferredOrganisationId
  );

  if (!resolved.ok) {
    // Pre-migration: fall back to auth-only context with a synthetic personal scope.
    // Callers that need full org features will still fail closed on missing tables.
    if (resolved.reason === "unavailable") {
      return {
        ok: true,
        context: {
          ...auth.context,
          organisation: {
            userId: auth.context.user.id,
            organisationId: auth.context.user.id,
            membershipId: auth.context.user.id,
            role: "owner",
            professionalRole: "coach",
            organisation: {
              id: auth.context.user.id,
              name: "Personal workspace",
              slug: null,
              organisationType: "personal",
              status: "active",
              createdBy: auth.context.user.id,
              defaultPreparationStyle: null,
              aiEnabled: true,
              dataRetentionPolicyLabel: "standard",
              brandingStatus: "none",
              logoUrl: null,
              licence: {
                planName: "Pilot",
                seatsPurchased: 1,
                status: "active",
                startsAt: null,
                endsAt: null,
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              archivedAt: null,
            },
            membership: {
              id: auth.context.user.id,
              organisationId: auth.context.user.id,
              userId: auth.context.user.id,
              role: "owner",
              professionalRole: "coach",
              status: "active",
              invitedBy: null,
              invitedAt: null,
              joinedAt: new Date().toISOString(),
              deactivatedAt: null,
              lastActiveAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        },
      };
    }

    return {
      ok: false,
      response: NextResponse.json(
        { error: "Organisation access required." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    context: {
      ...auth.context,
      organisation: resolved.context,
    },
  };
}

export function requireOrganisationPermission(
  context: OrganisationRequestContext,
  permission: OrganisationPermission
): NextResponse | null {
  if (!hasPermission(context.organisation.role, permission)) {
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  }
  return null;
}

/**
 * Verify the client belongs to the current organisation and the user
 * may access confidential coaching content (assignment required).
 */
export async function requireAssignedClientAccess(input: {
  supabase: SupabaseClient;
  context: OrganisationRequestContext;
  clientId: string;
}): Promise<
  | {
      ok: true;
      assignment: RelationshipAssignment | null;
      privateNotesOwnerId: string;
    }
  | { ok: false; response: NextResponse }
> {
  const { data: client, error } = await input.supabase
    .from("clients")
    .select("id, organisation_id, coach_id")
    .eq("id", input.clientId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unable to verify relationship." }, { status: 500 }),
    };
  }

  if (!client) {
    return { ok: false, response: notFoundOrForbidden() };
  }

  // Reject cross-organisation IDs with 404 (no existence leak).
  if (
    client.organisation_id &&
    client.organisation_id !== input.context.organisation.organisationId &&
    client.organisation_id !== input.context.user.id
  ) {
    return { ok: false, response: notFoundOrForbidden() };
  }

  const assignment = await getActiveAssignment(
    input.supabase,
    input.clientId,
    input.context.user.id
  );

  const legacyOwner =
    !assignment && client.coach_id === input.context.user.id;

  if (
    !canAccessCoachingContent({
      role: input.context.organisation.role,
      assignmentRole: assignment?.assignmentRole ?? (legacyOwner ? "primary" : null),
    }) &&
    !legacyOwner
  ) {
    return { ok: false, response: notFoundOrForbidden() };
  }

  return {
    ok: true,
    assignment,
    privateNotesOwnerId: client.coach_id as string,
  };
}

/**
 * Strip private practitioner-only fields for transferred / non-owner practitioners.
 */
export function redactPrivateNotesFields<T extends Record<string, unknown>>(
  record: T,
  input: {
    userId: string;
    role: OrganisationRequestContext["organisation"]["role"];
    assignmentRole: RelationshipAssignment["assignmentRole"] | null;
    privateNotesOwnerId: string;
  }
): T {
  const mayView = canAccessPrivateNotes({
    role: input.role,
    assignmentRole: input.assignmentRole,
    isOriginalPrivateNotesOwner: input.userId === input.privateNotesOwnerId,
  });

  if (mayView) return record;

  const next = { ...record };
  const privateKeys = [
    "private_notes",
    "privateNotes",
    "prep_private_notes",
    "prepPrivateNotes",
    "reflect_private",
    "reflectPrivate",
    "coach_reflection",
    "coachReflection",
  ] as const;

  for (const key of privateKeys) {
    if (key in next) {
      (next as Record<string, unknown>)[key] = "";
    }
  }

  return next;
}

export async function ensureUserOrganisationReady(
  supabase: SupabaseClient,
  user: User
): Promise<OrganisationContext | null> {
  const resolved = await resolveOrganisationContext(supabase, user.id);
  return resolved.ok ? resolved.context : null;
}
