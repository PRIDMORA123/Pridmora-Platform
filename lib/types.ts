import type { PreparationAiBrief } from "@/lib/preparation-brief";
import type { PreparationStyle } from "@/lib/preparation-style";
import type {
  InitialConversation,
  RelationshipAgreement,
  SupportingContextItem,
} from "@/lib/relationship-meta";
import type { IdentityMode } from "@/lib/relationship-identity";
import type {
  CoachingIntelligenceMode,
  CoachingIntelligenceStatus,
  IntelligenceSource,
} from "@/types/coaching-intelligence";

export type { IdentityMode };

export type ClientStatus = "Active" | "Paused" | "Archived";
export type StrengthStage = "Emerging" | "Developing" | "Established";
export type ActionStatus = "Open" | "In progress" | "Complete";
export type { PreparationStyle };

/** Coaching journey stages for a single session workspace. */
export type SessionStatus =
  | "planned"
  | "prepared"
  | "in_progress"
  | "paused"
  | "awaiting_completion"
  | "completed";

/** AI/coach summary lifecycle — never auto-approved. */
export type SummaryStatus = "not_generated" | "draft" | "approved";

export type Strength = {
  id: string;
  name: string;
  stage: StrengthStage;
  evidence: string;
};

export type ValueItem = {
  id: string;
  name: string;
  evidence: string;
};

export type CoachingAction = {
  id: string;
  title: string;
  status: ActionStatus;
  due?: string;
  /** Owning person (client, coach, or named other). */
  owner?: string;
  notes?: string;
  clientId?: string;
  sessionId?: string | null;
};

/**
 * Structured coaching session record.
 * One stable session_id workspace across Prepare → Coach → Reflect → Summary → Actions.
 */
export type Session = {
  id: string;
  /** Client this session belongs to (exactly one). */
  clientId: string;
  /** Owning coach. */
  coachId: string;
  /** Chronological session number for this client. */
  sessionNumber: number;
  /** Optional display title. */
  title: string;
  /** Session date (display form). */
  date: string;
  time: string;
  /** Duration in minutes (default 60). */
  durationMinutes: number;
  /** Location or meeting link. */
  location: string;
  /** Journey status. */
  status: SessionStatus;
  focus: string;
  /** Legacy freeform preparation (kept in sync for older views). */
  preparation: string;
  prepPurpose: string;
  prepTopics: string;
  prepQuestions: string;
  prepCommitmentsReview: string;
  prepRisks: string;
  prepPrivateNotes: string;
  /** Persisted AI preparation draft (coach-editable). */
  prepAiBrief: PreparationAiBrief | null;
  prepAiBriefGeneratedAt: string;
  prepAiBriefStyle: PreparationStyle | "";
  prepAiBriefConfirmedAt: string;
  prepAiBriefSourceFingerprint: string;
  /** Professional Coaching Intelligence™ generation metadata. */
  intelligenceMode: CoachingIntelligenceMode | "";
  intelligenceStatus: CoachingIntelligenceStatus;
  intelligenceSources: IntelligenceSource[];
  intelligenceLastRefreshedAt: string;
  intelligenceErrorCode: string;
  /** Raw Session Notes (coach-entered only — never workflow metadata). */
  notes: string;
  commitments: string;
  parkingLot: string;
  /** ISO timestamp when live notes were last saved. */
  notesSavedAt: string;
  /** Accumulated live timer seconds while the timer is not running. */
  timerElapsedSeconds: number;
  /** ISO timestamp when the live timer last started; null when paused/stopped. */
  timerStartedAt: string | null;
  /** ISO timestamp when the live conversation first started. */
  sessionStartedAt: string | null;
  /** Coach Private Notes (legacy freeform mirror of reflectPrivate). */
  reflection: string;
  reflectWhatShifted: string;
  reflectWhatSurprised: string;
  reflectWhatWorked: string;
  reflectDifferently: string;
  reflectProfessionalLearning: string;
  reflectPrivate: string;
  /** AI Draft Summary (Session Summary section; coach-editable) */
  summary: string;
  /** Emerging Themes (coach-editable) */
  emergingThemes: string;
  /** Strengths Observed (coach-editable) */
  strengthsObserved: string;
  /** Values Becoming Visible (coach-editable) */
  valuesBecomingVisible: string;
  /** Professional Identity Development (coach-editable) */
  professionalIdentityDevelopment: string;
  /** Agreed Actions (coach-editable summary text) */
  agreedActions: string;
  outcomes: string;
  /** Suggested Focus for the next session (coach-editable) */
  suggestedFocus: string;
  /** Coach Reflection from the AI draft (coach-editable) */
  coachReflection: string;
  summaryStatus: SummaryStatus;
  /**
   * True once the coach has reviewed and approved
   * the AI-generated coaching record (synced with summaryStatus === "approved").
   */
  aiSummaryApproved: boolean;
  /** Generated powerful coaching questions (coach-facing draft). */
  coachingQuestions: string[];
  /** ISO timestamp when the session was marked completed. */
  completedAt: string;
  /** ISO timestamp of last save. */
  lastUpdated: string;
};

export type JourneyEvent = {
  id: string;
  date: string;
  title: string;
  detail: string;
};

export type Client = {
  id: string;
  name: string;
  initials: string;
  organisation: string;
  role: string;
  /** Optional contact email for the client (empty string when unset). */
  email: string;
  /**
   * How relationship identity is managed.
   * confidential: public row holds display label + reference only.
   * Defaults to standard when absent (legacy rows / fixtures).
   */
  identityMode?: IdentityMode;
  /** Coach-facing public label (never private real name in confidential mode). */
  displayLabel?: string;
  /** Short non-identifying reference (e.g. C-7K4M2P); null in standard mode. */
  confidentialReference?: string | null;
  /** When true in standard mode, AI may use the preferred name. */
  aiNameAllowed?: boolean;
  /**
   * Practitioner's own My Development record — not a managed person.
   * Excluded from People lists.
   */
  isSelfDevelopment?: boolean;
  status: ClientStatus;
  /** ISO timestamp when archived; null/undefined when active. */
  archivedAt?: string | null;
  /** ISO timestamp when the client record was created. */
  createdAt?: string;
  nextSession: string;
  /**
   * Coaching Purpose for the engagement.
   * Persisted as `clients.current_focus`; entered at client creation.
   */
  currentFocus: string;
  identitySummary: string;
  coachInsight: string;
  /**
   * Optional preparation style override for this coaching relationship.
   * null = use the coach default.
   */
  preparationStyleOverride: PreparationStyle | null;
  /**
   * Optional agreement and boundaries (relationship-level).
   * Never required for manager-led coaching.
   */
  relationshipAgreement?: RelationshipAgreement;
  /**
   * Optional initial / chemistry conversation.
   * Does not count as Session 1 by default.
   */
  initialConversation?: InitialConversation;
  /** Optional programme-neutral supporting context for the relationship. */
  supportingContext?: SupportingContextItem[];
  strengths: Strength[];
  values: ValueItem[];
  themes: string[];
  goals: string[];
  actions: CoachingAction[];
  quotes: string[];
  sessions: Session[];
  journey: JourneyEvent[];
};

/** True when the client is soft-archived and must not accept new coaching activity. */
export function isClientArchived(client: Pick<Client, "status" | "archivedAt">): boolean {
  return client.status === "Archived" || Boolean(client.archivedAt);
}
