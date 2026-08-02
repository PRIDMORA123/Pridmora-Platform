import { apiJson } from "@/lib/api-client";
import { modeToPreparationStyle } from "@/lib/coaching-intelligence/mode";
import type {
  CoachingIntelligenceMode,
  GeneratedPreparationBrief,
  IntelligenceSource,
} from "@/types/coaching-intelligence";

export type GeneratePreparationIntelligenceInput = {
  relationshipId: string;
  conversationId: string;
  mode: Exclude<CoachingIntelligenceMode, "manual">;
};

export type GeneratePreparationIntelligenceResult = {
  mode: Exclude<CoachingIntelligenceMode, "manual">;
  generatedAt: string;
  usedSources: IntelligenceSource[];
  brief: GeneratedPreparationBrief;
  /** Compatibility payload for existing Prepare consumers. */
  preparationAiBrief?: unknown;
  sourceFingerprint?: string;
};

export async function generatePreparationIntelligence(
  input: GeneratePreparationIntelligenceInput
): Promise<GeneratePreparationIntelligenceResult> {
  return apiJson<GeneratePreparationIntelligenceResult>(
    "/api/coaching-intelligence/prepare",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );
}

export async function updateCoachIntelligenceMode(input: {
  mode: CoachingIntelligenceMode;
}) {
  return apiJson<{
    profile: {
      coachingIntelligenceMode: CoachingIntelligenceMode;
      preparationStyle: string;
    };
    message?: string;
  }>("/api/profile", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coachingIntelligenceMode: input.mode,
    }),
  });
}

export async function updateRelationshipIntelligenceMode(input: {
  relationshipId: string;
  mode: CoachingIntelligenceMode;
  client: {
    name: string;
    organisation?: string | null;
    role?: string | null;
    email?: string | null;
  };
}) {
  return apiJson<{
    client: {
      id: string;
      preparationStyleOverride?: string | null;
    };
  }>(`/api/clients/${encodeURIComponent(input.relationshipId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.client.name,
      organisation: input.client.organisation ?? "",
      role: input.client.role ?? "",
      email: input.client.email ?? "",
      preparationStyleOverride: modeToPreparationStyle(input.mode),
    }),
  });
}
