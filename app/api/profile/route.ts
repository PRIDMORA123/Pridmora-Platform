import { NextResponse } from "next/server";
import {
  claimLegacyDemoDataIfEligible,
  ensureCoachProfile,
  getCoachProfile,
  requireAuthenticatedUser,
} from "@/lib/auth/session";
import { initialsFromFullName } from "@/lib/auth/session-client";
import {
  isCoachingIntelligenceMode,
  modeToPreparationStyle,
  preparationStyleToMode,
} from "@/lib/coaching-intelligence/mode";
import {
  isPreparationStyle,
  type PreparationStyle,
} from "@/lib/preparation-style";
import type { CoachingIntelligenceMode } from "@/types/coaching-intelligence";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const profile = await ensureCoachProfile(auth.context.supabase, auth.context.user);
    await claimLegacyDemoDataIfEligible(auth.context.supabase, auth.context.user);

    return NextResponse.json({
      profile: {
        ...profile,
        initials: initialsFromFullName(profile.fullName),
        email: auth.context.user.email ?? null,
      },
    });
  } catch (error) {
    console.error("Load profile error:", error);
    return NextResponse.json(
      { error: "Unable to load your profile. Please try signing in again." },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      preparationStyle?: unknown;
      coachingIntelligenceMode?: unknown;
    };

    const hasMode = body.coachingIntelligenceMode !== undefined;
    const hasStyle = body.preparationStyle !== undefined;

    if (!hasMode && !hasStyle) {
      return NextResponse.json(
        { error: "Choose a coaching intelligence support level." },
        { status: 400 }
      );
    }

    if (hasMode && !isCoachingIntelligenceMode(body.coachingIntelligenceMode)) {
      return NextResponse.json(
        { error: "Choose Manual, Standard or Comprehensive support." },
        { status: 400 }
      );
    }

    if (hasStyle && !isPreparationStyle(body.preparationStyle)) {
      return NextResponse.json(
        { error: "Choose Manual, Standard or Comprehensive preparation support." },
        { status: 400 }
      );
    }

    let coachingIntelligenceMode: CoachingIntelligenceMode;
    let preparationStyle: PreparationStyle;

    if (hasMode) {
      coachingIntelligenceMode = body.coachingIntelligenceMode as CoachingIntelligenceMode;
      preparationStyle = modeToPreparationStyle(coachingIntelligenceMode);
    } else {
      preparationStyle = body.preparationStyle as PreparationStyle;
      coachingIntelligenceMode = preparationStyleToMode(preparationStyle);
    }

    const { error } = await auth.context.supabase
      .from("profiles")
      .update({
        preparation_style: preparationStyle,
        coaching_intelligence_mode: coachingIntelligenceMode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auth.context.coachId);

    if (error) {
      console.error("Update profile error:", error.message);
      // Fallback for environments that have not applied the intelligence migration yet.
      if (/coaching_intelligence_mode/i.test(error.message)) {
        const fallback = await auth.context.supabase
          .from("profiles")
          .update({
            preparation_style: preparationStyle,
            updated_at: new Date().toISOString(),
          })
          .eq("id", auth.context.coachId);
        if (fallback.error) {
          return NextResponse.json(
            { error: "Unable to save your coaching intelligence preference." },
            { status: 503 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Unable to save your coaching intelligence preference." },
          { status: 503 }
        );
      }
    }

    const profile =
      (await getCoachProfile(auth.context.supabase, auth.context.coachId)) ??
      (await ensureCoachProfile(auth.context.supabase, auth.context.user));

    return NextResponse.json({
      profile: {
        ...profile,
        initials: initialsFromFullName(profile.fullName),
        email: auth.context.user.email ?? null,
      },
      message: "Coaching intelligence preference saved.",
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Unable to save your coaching intelligence preference." },
      { status: 503 }
    );
  }
}
