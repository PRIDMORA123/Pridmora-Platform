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
  myDevelopmentLabel: "My development",
  myPeopleLabel: "My people",
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
