export type EvidenceConfidence = "emerging" | "developing" | "demonstrated";

/** Reviewed evidence already stored on the approved development record. */
export type DevelopmentThemeEvidenceItem = {
  id: string;
  /** e.g. "Approved development update" */
  sourceLabel: string;
  /** e.g. "Session 2" when session provenance exists */
  sessionLabel?: string;
  /** Existing evidence text / excerpt — not regenerated */
  content: string;
};

export type DevelopmentTheme = {
  id: string;
  name: string;
  confidence: EvidenceConfidence;
  narrative: string;
  evidenceCount: number;
  /** Linked reviewed evidence from applied development updates / profile. */
  evidenceItems?: DevelopmentThemeEvidenceItem[];
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
