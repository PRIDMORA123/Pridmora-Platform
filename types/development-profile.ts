export type EvidenceConfidence = "emerging" | "developing" | "demonstrated";

export type DevelopmentTheme = {
  id: string;
  name: string;
  confidence: EvidenceConfidence;
  narrative: string;
  evidenceCount: number;
};

export type DevelopmentMilestone = {
  id: string;
  date: string;
  title: string;
  description: string;
  sourceType: "conversation" | "reflection" | "commitment" | "summary";
};

export type DevelopmentProfileViewModel = {
  clientName: string;
  currentDirection?: string | null;
  emergingStrengths: string[];
  themes: DevelopmentTheme[];
  milestones: DevelopmentMilestone[];
  notYetEstablished: string[];
  lookingAhead: string[];
  behaviouralEvidence: string[];
};
