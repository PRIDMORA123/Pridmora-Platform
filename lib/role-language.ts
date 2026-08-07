/**
 * Role-aware product language for the Manager Development platform.
 * Professional coaches retain coaching terminology; managers use people language.
 */

import type { ProfessionalRole } from "@/lib/organisations/types";

export type ProductLanguage = {
  peopleNavLabel: string;
  personSingular: string;
  personPlural: string;
  peopleISupport: string;
  relationshipSingular: string;
  relationshipPlural: string;
  conversationSingular: string;
  conversationPlural: string;
  homeTitle: string;
  homeEyebrow: string;
  homeSummary: string;
  overviewTitle: string;
  overviewEyebrow: string;
  overviewDescription: string;
  notesLabel: string;
  preparationTitle: string;
  intelligenceTitle: string;
  newPersonLabel: string;
  emptyRelationshipsTitle: string;
  emptyRelationshipsDescription: string;
  myDevelopmentLabel: string;
  myPeopleLabel: string;
  accountRoleTitle: string;
  activeWorkDescription: string;
  continueWorkDescription: string;
  workUpToDateTitle: string;
  recentDevelopmentDescription: string;
  momentsTitle: string;
  momentsDescription: string;
  newMomentLabel: string;
  momentsUnavailable: string;
  momentsArchived: string;
};

const MANAGER_LANGUAGE: ProductLanguage = {
  peopleNavLabel: "People",
  personSingular: "team member",
  personPlural: "team members",
  peopleISupport: "People I support",
  relationshipSingular: "development relationship",
  relationshipPlural: "development relationships",
  conversationSingular: "development conversation",
  conversationPlural: "development conversations",
  homeTitle: "My Management Overview",
  homeEyebrow: "Management priorities",
  homeSummary: "What deserves your attention across the people you support.",
  overviewTitle: "Management overview",
  overviewEyebrow: "Your priorities",
  overviewDescription: "A concise view of your current management and development work.",
  notesLabel: "Manager notes",
  preparationTitle: "Conversation preparation",
  intelligenceTitle: "Development intelligence",
  newPersonLabel: "New person",
  emptyRelationshipsTitle: "Add the first person you support.",
  emptyRelationshipsDescription:
    "Create a development relationship and agree the purpose of the work.",
  myDevelopmentLabel: "My Development",
  myPeopleLabel: "My People",
  accountRoleTitle: "Manager",
  activeWorkDescription: "Continue the management work already under way.",
  continueWorkDescription: "Continue the management work already under way.",
  workUpToDateTitle: "You’re up to date",
  recentDevelopmentDescription:
    "Recent approved development across the people you support.",
  momentsTitle: "Development moments",
  momentsDescription:
    "Capture a significant management interaction outside the formal conversation sequence.",
  newMomentLabel: "New development moment",
  momentsUnavailable: "Development moments are temporarily unavailable.",
  momentsArchived:
    "This relationship is archived. New development moments cannot be created. Historical moments remain available below.",
};

const COACH_LANGUAGE: ProductLanguage = {
  peopleNavLabel: "People",
  personSingular: "client",
  personPlural: "clients",
  peopleISupport: "Clients",
  relationshipSingular: "coaching relationship",
  relationshipPlural: "coaching relationships",
  conversationSingular: "development conversation",
  conversationPlural: "development conversations",
  homeTitle: "Development Overview",
  homeEyebrow: "Practice priorities",
  homeSummary: "What deserves your attention across your coaching relationships.",
  overviewTitle: "Coaching overview",
  overviewEyebrow: "Your practice",
  overviewDescription: "A concise view of your current coaching work.",
  notesLabel: "Coach notes",
  preparationTitle: "Conversation preparation",
  intelligenceTitle: "Development intelligence",
  newPersonLabel: "New person",
  emptyRelationshipsTitle: "Begin your first coaching relationship.",
  emptyRelationshipsDescription:
    "Add the person you will be coaching and establish the purpose of the work.",
  myDevelopmentLabel: "My development",
  myPeopleLabel: "My clients",
  accountRoleTitle: "Professional Coach",
  activeWorkDescription: "Continue the coaching work already under way.",
  continueWorkDescription: "Continue the coaching work already under way.",
  workUpToDateTitle: "Your coaching work is up to date",
  recentDevelopmentDescription:
    "Recent approved development across your coaching relationships.",
  momentsTitle: "Coaching Moments",
  momentsDescription:
    "Capture a significant coaching interaction outside the formal conversation sequence.",
  newMomentLabel: "New Coaching Moment",
  momentsUnavailable: "Coaching Moments are temporarily unavailable.",
  momentsArchived:
    "This relationship is archived. New Coaching Moments cannot be created. Historical moments remain available below.",
};

const DEFAULT_LANGUAGE: ProductLanguage = {
  ...MANAGER_LANGUAGE,
  personSingular: "person",
  personPlural: "people",
  homeTitle: "Development Overview",
  homeEyebrow: "Priorities",
  homeSummary: "What deserves your attention across the people you support.",
  overviewTitle: "Development overview",
  overviewEyebrow: "Your work",
  overviewDescription: "A concise view of your current development work.",
  notesLabel: "Conversation notes",
  myPeopleLabel: "People I support",
  accountRoleTitle: "Practitioner",
  activeWorkDescription: "Continue the development work already under way.",
  continueWorkDescription: "Continue the development work already under way.",
  workUpToDateTitle: "Your development work is up to date",
  recentDevelopmentDescription:
    "Recent approved development across the people you support.",
  momentsTitle: "Development moments",
  momentsDescription:
    "Capture a significant development interaction outside the formal conversation sequence.",
  newMomentLabel: "New development moment",
  momentsUnavailable: "Development moments are temporarily unavailable.",
  momentsArchived:
    "This relationship is archived. New development moments cannot be created. Historical moments remain available below.",
};

export function resolveProductLanguage(
  professionalRole?: ProfessionalRole | null
): ProductLanguage {
  if (professionalRole === "coach") return COACH_LANGUAGE;
  if (professionalRole === "manager") return MANAGER_LANGUAGE;
  if (
    professionalRole === "mentor" ||
    professionalRole === "facilitator" ||
    professionalRole === "supervisor"
  ) {
    return {
      ...DEFAULT_LANGUAGE,
      personSingular: "person",
      personPlural: "people",
      peopleISupport: "People I support",
    };
  }
  return DEFAULT_LANGUAGE;
}

export function isCoachFacingRole(
  professionalRole?: ProfessionalRole | null
): boolean {
  return professionalRole === "coach";
}

/**
 * Sidebar/account role label.
 * Managers always show Manager. Coaches keep an explicit profile title when set.
 */
export function resolveAccountRoleTitle(input: {
  professionalRole?: ProfessionalRole | null;
  profileTitle?: string | null;
}): string {
  const language = resolveProductLanguage(input.professionalRole);
  if (input.professionalRole === "manager") {
    return language.accountRoleTitle;
  }
  if (input.professionalRole === "coach") {
    const profileTitle = input.profileTitle?.trim();
    return profileTitle || language.accountRoleTitle;
  }
  const profileTitle = input.profileTitle?.trim();
  return profileTitle || language.accountRoleTitle;
}
