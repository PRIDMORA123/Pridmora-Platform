import type { PreparationStyle } from "@/lib/preparation-style";
import type { CoachingIntelligenceMode } from "@/types/coaching-intelligence";

export type CoachProfile = {
  id: string;
  fullName: string;
  professionalTitle: string;
  organisation: string | null;
  /** Coach default preparation support. Defaults to guided. */
  preparationStyle: PreparationStyle;
  /** Professional Coaching Intelligence™ support level. Defaults to assisted. */
  coachingIntelligenceMode: CoachingIntelligenceMode;
  createdAt?: string;
  updatedAt?: string;
};
