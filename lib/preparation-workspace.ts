import type { Client, Session } from "@/lib/types";
import {
  formatPreparationGeneratedAt,
  hasPreparationAiContent,
  isPreparationBriefStale,
  type PreparationAiBrief,
} from "@/lib/preparation-brief";
import {
  PREPARATION_STYLE_LABELS,
  preparationSectionVisibility,
  resolvePreparationStyle,
  type PreparationStyle,
} from "@/lib/preparation-style";
export type PreparationWorkspaceViewModel = {
  person: {
    id: string;
    name: string;
    role?: string | null;
    organisation?: string | null;
  };

  effectiveApproach: "minimal" | "guided" | "enhanced";
  displayApproach: "Manual" | "Assisted" | "Comprehensive";
  isClientOverride: boolean;

  briefExists: boolean;
  briefNeedsUpdate: boolean;
  briefConfirmed: boolean;
  lastUpdated?: string | null;

  aiSupportAvailable: boolean;
  aiSectionsPresent: boolean;
  generationStatus:
    | "not_generated"
    | "ready"
    | "stale"
    | "unavailable"
    | "failed";

  nextAction:
    | "create_brief"
    | "update_brief"
    | "confirm_preparation"
    | "start_conversation";

  supportTitle: string;
  supportDescription: string;
  statusHeadline: string;
  statusDetail: string;
  evidenceLabel: string;
};

export const PREPARATION_EVIDENCE_LABEL =
  "Proposed sections are generated from approved coaching evidence and should be reviewed before use.";

const SUPPORT_COPY: Record<
  PreparationStyle,
  { title: string; description: string }
> = {
  minimal: {
    title: "Manual Brief",
    description:
      "Identity brings together the latest approved coaching information, commitments and coach notes.",
  },
  guided: {
    title: "Assisted Brief",
    description:
      "Identity brings together the latest approved information and proposes themes, coaching questions and one reflection prompt.",
  },
  enhanced: {
    title: "Comprehensive Brief",
    description:
      "Identity brings together the latest approved information and proposes wider patterns, development direction and additional questions.",
  },
};

export type BuildPreparationWorkspaceInput = {
  person: Pick<Client, "id" | "name" | "role" | "organisation" | "preparationStyleOverride">;
  session: Pick<
    Session,
    | "status"
    | "prepAiBrief"
    | "prepAiBriefGeneratedAt"
    | "prepAiBriefConfirmedAt"
    | "prepAiBriefSourceFingerprint"
    | "prepAiBriefStyle"
    | "preparation"
  >;
  coachPreparationStyle?: PreparationStyle | string | null;
  currentFingerprint?: string;
  aiUnavailable?: boolean;
  aiFailed?: boolean;
};

/**
 * Single shared preparation status mapping used by every Prepare entry point.
 */
export function buildPreparationWorkspaceViewModel(
  input: BuildPreparationWorkspaceInput
): PreparationWorkspaceViewModel {
  const effectiveApproach = resolvePreparationStyle(
    input.coachPreparationStyle,
    input.person.preparationStyleOverride
  );
  const displayApproach = PREPARATION_STYLE_LABELS[effectiveApproach] as
    | "Manual"
    | "Assisted"
    | "Comprehensive";
  const visibility = preparationSectionVisibility(effectiveApproach);
  const brief = input.session.prepAiBrief as PreparationAiBrief | null;
  const briefExists = hasPreparationAiContent(brief);
  const briefConfirmed = Boolean(input.session.prepAiBriefConfirmedAt);
  const styleMismatch =
    briefExists &&
    Boolean(input.session.prepAiBriefStyle) &&
    input.session.prepAiBriefStyle !== effectiveApproach;
  const stale =
    Boolean(input.currentFingerprint) &&
    isPreparationBriefStale(
      {
        generatedAt: input.session.prepAiBriefGeneratedAt,
        sourceFingerprint: input.session.prepAiBriefSourceFingerprint,
      },
      input.currentFingerprint!
    );
  const briefNeedsUpdate = (stale && briefExists) || styleMismatch;
  const aiSupportAvailable = visibility.showAiSupport;
  const aiSectionsPresent = aiSupportAvailable && briefExists;

  let generationStatus: PreparationWorkspaceViewModel["generationStatus"] =
    "not_generated";
  if (input.aiUnavailable || input.aiFailed) {
    generationStatus = input.aiFailed ? "failed" : "unavailable";
  } else if (briefNeedsUpdate) {
    generationStatus = "stale";
  } else if (briefExists) {
    generationStatus = "ready";
  }

  const isReadyToStart =
    briefConfirmed || input.session.status === "prepared";

  let nextAction: PreparationWorkspaceViewModel["nextAction"] = "confirm_preparation";
  if (aiSupportAvailable && !briefExists && generationStatus === "not_generated") {
    nextAction = "create_brief";
  } else if (briefNeedsUpdate) {
    nextAction = "update_brief";
  } else if (isReadyToStart) {
    nextAction = "start_conversation";
  }

  const support = SUPPORT_COPY[effectiveApproach];
  const { statusHeadline, statusDetail } = statusCopy({
    generationStatus,
    briefExists,
    aiSupportAvailable,
  });

  return {
    person: {
      id: input.person.id,
      name: input.person.name,
      role: input.person.role,
      organisation: input.person.organisation,
    },
    effectiveApproach,
    displayApproach,
    isClientOverride: Boolean(input.person.preparationStyleOverride),
    briefExists,
    briefNeedsUpdate,
    briefConfirmed,
    lastUpdated: input.session.prepAiBriefGeneratedAt
      ? formatPreparationGeneratedAt(input.session.prepAiBriefGeneratedAt)
      : null,
    aiSupportAvailable,
    aiSectionsPresent,
    generationStatus,
    nextAction,
    supportTitle: support.title,
    supportDescription: support.description,
    statusHeadline,
    statusDetail,
    evidenceLabel: PREPARATION_EVIDENCE_LABEL,
  };
}

function statusCopy({
  generationStatus,
  briefExists,
  aiSupportAvailable,
}: {
  generationStatus: PreparationWorkspaceViewModel["generationStatus"];
  briefExists: boolean;
  aiSupportAvailable: boolean;
}): { statusHeadline: string; statusDetail: string } {
  if (generationStatus === "unavailable" || generationStatus === "failed") {
    return {
      statusHeadline: "Preparation support is temporarily unavailable.",
      statusDetail:
        "Your client information, previous commitments and coach notes remain available below.",
    };
  }

  if (generationStatus === "stale") {
    return {
      statusHeadline: "New development information is available.",
      statusDetail:
        "Update the brief when you are ready to include the latest approved information.",
    };
  }

  if (briefExists && generationStatus === "ready") {
    return {
      statusHeadline: "Your Preparation Brief is current.",
      statusDetail: aiSupportAvailable
        ? "Proposed sections are available below for review and editing."
        : "This brief includes the latest approved development information.",
    };
  }

  if (aiSupportAvailable) {
    return {
      statusHeadline: "Preparation support is ready.",
      statusDetail:
        "Create a brief using the latest approved coaching information.",
    };
  }

  return {
    statusHeadline: "Manual preparation is ready.",
    statusDetail:
      "Review the latest approved coaching information, commitments and coach notes below.",
  };
}

export function preparationPrimaryActionLabel(
  nextAction: PreparationWorkspaceViewModel["nextAction"],
  busy?: { saving?: boolean; generating?: boolean }
): string {
  if (busy?.generating && (nextAction === "create_brief" || nextAction === "update_brief")) {
    return nextAction === "update_brief" ? "Updating…" : "Generating…";
  }
  if (busy?.saving && (nextAction === "confirm_preparation" || nextAction === "start_conversation")) {
    return nextAction === "start_conversation" ? "Starting…" : "Saving…";
  }
  switch (nextAction) {
    case "create_brief":
      return "Create Preparation Brief";
    case "update_brief":
      return "Update Preparation Brief";
    case "confirm_preparation":
      return "Confirm Preparation";
    case "start_conversation":
      return "Start Development Conversation";
  }
}
