import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";
import type { CoachProfile } from "@/lib/auth/types";
import {
  DEFAULT_COACHING_INTELLIGENCE_MODE,
} from "@/lib/coaching-intelligence/mode-config";
import {
  parseCoachingIntelligenceMode,
  preparationStyleToMode,
} from "@/lib/coaching-intelligence/mode";
import {
  DEFAULT_PREPARATION_STYLE,
  parsePreparationStyle,
} from "@/lib/preparation-style";

export type AuthenticatedRequest = {
  supabase: SupabaseClient;
  user: User;
  coachId: string;
};

/**
 * Require a valid Supabase Auth user for an API route.
 * Returns 401 when unauthenticated — does not reveal resource existence.
 */
export async function requireAuthenticatedUser(): Promise<
  { ok: true; context: AuthenticatedRequest } | { ok: false; response: NextResponse }
> {
  try {
    const supabase = await createAuthenticatedServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
      };
    }

    return {
      ok: true,
      context: {
        supabase,
        user: data.user,
        coachId: data.user.id,
      },
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }
}

/**
 * Uniform denial for missing or foreign-owned resources (avoid existence leaks).
 */
export function notFoundOrForbidden(): NextResponse {
  return NextResponse.json({ error: "Resource not found." }, { status: 404 });
}

export async function getCoachProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<CoachProfile | null> {
  let { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, professional_title, organisation, preparation_style, coaching_intelligence_mode, created_at, updated_at"
    )
    .eq("id", userId)
    .maybeSingle();

  // Pre-migration environments may not have newer preference columns yet.
  if (
    error &&
    (/preparation_style/i.test(error.message) ||
      /coaching_intelligence_mode/i.test(error.message))
  ) {
    const fallback = await supabase
      .from("profiles")
      .select("id, full_name, professional_title, organisation, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle();
    data = fallback.data
      ? {
          ...fallback.data,
          preparation_style: DEFAULT_PREPARATION_STYLE,
          coaching_intelligence_mode: DEFAULT_COACHING_INTELLIGENCE_MODE,
        }
      : null;
    error = fallback.error;
  }

  if (error) {
    console.error("Unable to load coach profile:", error.message);
    return null;
  }

  if (!data) return null;

  const preparationStyle = parsePreparationStyle(
    data.preparation_style,
    DEFAULT_PREPARATION_STYLE
  );
  const coachingIntelligenceMode = parseCoachingIntelligenceMode(
    data.coaching_intelligence_mode,
    preparationStyleToMode(preparationStyle)
  );

  return {
    id: data.id,
    fullName: data.full_name || "Coach",
    professionalTitle: data.professional_title || "Professional Coach",
    organisation: data.organisation,
    preparationStyle,
    coachingIntelligenceMode,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Ensure a profile row exists (covers users created before the trigger).
 */
export async function ensureCoachProfile(
  supabase: SupabaseClient,
  user: User
): Promise<CoachProfile> {
  const existing = await getCoachProfile(supabase, user.id);
  if (existing) {
    // Ensure personal organisation exists for returning users (idempotent).
    try {
      const { ensurePersonalOrganisation } = await import(
        "@/lib/organisations/repository"
      );
      await ensurePersonalOrganisation(supabase, user.id);
    } catch {
      // Organisation tables may not be migrated yet.
    }
    return existing;
  }

  const meta = user.user_metadata ?? {};
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    user.email?.split("@")[0] ||
    "Coach";
  const professionalTitle =
    (typeof meta.professional_title === "string" && meta.professional_title.trim()) ||
    "Professional Coach";
  const organisation =
    typeof meta.organisation === "string" && meta.organisation.trim()
      ? meta.organisation.trim()
      : null;

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: fullName,
    professional_title: professionalTitle,
    organisation,
    preparation_style: DEFAULT_PREPARATION_STYLE,
    coaching_intelligence_mode: DEFAULT_COACHING_INTELLIGENCE_MODE,
  });

  if (error) {
    console.error("Unable to create coach profile:", error.message);
  }

  try {
    const { ensurePersonalOrganisation } = await import(
      "@/lib/organisations/repository"
    );
    await ensurePersonalOrganisation(supabase, user.id);
  } catch {
    // Organisation tables may not be migrated yet.
  }

  return {
    id: user.id,
    fullName,
    professionalTitle,
    organisation,
    preparationStyle: DEFAULT_PREPARATION_STYLE,
    coachingIntelligenceMode: DEFAULT_COACHING_INTELLIGENCE_MODE,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Option A follow-up: claim legacy demo-owned rows after the preferred coach signs in.
 */
export async function claimLegacyDemoDataIfEligible(
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  try {
    await supabase.rpc("claim_legacy_demo_data", { p_coach_id: user.id });
  } catch (error) {
    console.warn("Demo data claim skipped:", error);
  }
}
