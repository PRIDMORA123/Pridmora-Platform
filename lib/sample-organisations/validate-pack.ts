import { z } from "zod";
import type {
  SampleActionSpec,
  SampleAssignmentSpec,
  SampleDevelopmentUpdateSpec,
  SampleIntelligenceItemSpec,
  SampleOrganisationSpec,
  SamplePackManifest,
  SampleRelationshipSpec,
  SampleSessionSpec,
  ValidatedSamplePack,
} from "@/lib/sample-organisations/types";

const identityModeSchema = z.enum(["standard", "confidential"]);

export const samplePackManifestSchema = z.object({
  packKey: z.string().min(1),
  packVersion: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  locale: z.string().min(1),
  estimatedSetupSeconds: z.number().int().positive(),
  period: z.object({
    start: z.string().min(1),
    end: z.string().min(1),
    label: z.string().min(1),
  }),
  expectedCounts: z.object({
    organisations: z.number().int().positive(),
    relationships: z.number().int().positive(),
    standardRelationships: z.number().int().nonnegative(),
    confidentialRelationships: z.number().int().nonnegative(),
    sessions: z.number().int().positive(),
    actions: z.number().int().positive(),
    developmentUpdates: z.number().int().positive(),
    intelligenceItems: z.number().int().positive(),
    organisationIntelligenceSnapshots: z.number().int().positive(),
  }),
  features: z.array(z.string().min(1)).min(1),
  recurringThemes: z.array(z.string().min(1)).min(5),
  privacy: z.object({
    minimumThemeRelationships: z.number().int().positive(),
    confidentialIdentityMode: z.string().min(1),
    notes: z.string().min(1),
  }),
  files: z.record(z.string(), z.string()),
});

export const sampleOrganisationSchema = z.object({
  name: z.string().min(1),
  slugHint: z.string().min(1),
  organisationType: z.string().min(1),
  defaultPreparationStyle: z.string().nullable(),
  aiEnabled: z.boolean(),
  dataRetentionPolicyLabel: z.string().min(1),
  licence: z.object({
    planName: z.string().min(1),
    seatsPurchased: z.number().int().positive(),
    status: z.string().min(1),
  }),
  description: z.string().optional(),
});

export const sampleRelationshipSchema = z.object({
  key: z.string().min(1),
  identityMode: identityModeSchema,
  name: z.string(),
  displayLabel: z.string().min(1),
  role: z.string().min(1),
  organisationLabel: z.string().min(1),
  email: z.string(),
  currentFocus: z.string().min(1),
  aiNameAllowed: z.boolean(),
  themes: z.array(z.string().min(1)).min(1),
});

export const sampleAssignmentSchema = z.object({
  relationshipKey: z.string().min(1),
  assignmentRole: z.enum([
    "primary",
    "co_practitioner",
    "cover",
    "supervisor",
  ]),
  assignee: z.literal("installing_user"),
});

export const sampleSessionSchema = z.object({
  key: z.string().min(1),
  relationshipKey: z.string().min(1),
  sessionNumber: z.number().int().positive(),
  sessionDate: z.string().min(1),
  displayDate: z.string().min(1),
  displayTime: z.string().min(1),
  startsAt: z.string().min(1),
  status: z.string().min(1),
  title: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  focus: z.string().min(1),
  preparation: z.string(),
  notes: z.string().min(1),
  privateNotes: z.string().optional(),
  emergingThemes: z.string(),
  strengthsObserved: z.string(),
  valuesBecomingVisible: z.string(),
  professionalIdentityDevelopment: z.string(),
  agreedActions: z.string(),
  suggestedFocus: z.string(),
  coachReflection: z.string(),
  summary: z.string(),
  aiSummaryApproved: z.boolean(),
  completedAt: z.string().optional(),
  themeKeys: z.array(z.string()).optional(),
});

export const sampleActionSchema = z.object({
  key: z.string().min(1),
  relationshipKey: z.string().min(1),
  sessionKey: z.string().min(1),
  title: z.string().min(1),
  notes: z.string().optional(),
  owner: z.string().optional(),
  status: z.string().min(1),
  due: z.string().optional(),
  themeKey: z.string().optional(),
});

export const sampleDevelopmentUpdateSchema = z.object({
  key: z.string().min(1),
  relationshipKey: z.string().min(1),
  sessionKey: z.string().min(1),
  status: z.string().min(1),
  conversationSummary: z.string().min(1),
  hasMeaningfulChanges: z.boolean(),
  proposedChanges: z.record(z.string(), z.unknown()),
  evidenceSummary: z.array(z.record(z.string(), z.unknown())),
  coachNote: z.string().optional(),
  generatedAt: z.string().optional(),
  reviewedAt: z.string().optional(),
  appliedAt: z.string().optional(),
});

export const sampleIntelligenceItemSchema = z.object({
  key: z.string().min(1),
  relationshipKey: z.string().min(1),
  sessionKey: z.string().min(1),
  category: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  status: z.literal("approved"),
  confidenceScore: z.number(),
  confidenceLabel: z.string().min(1),
  sourceType: z.string().min(1),
  firstIdentifiedAt: z.string().optional(),
  approvedAt: z.string().optional(),
  themeKey: z.string().optional(),
  evidenceText: z.string().optional(),
});

export type PackValidationIssue = {
  path: string;
  message: string;
};

export type PackValidationResult =
  | { ok: true; pack: ValidatedSamplePack }
  | { ok: false; issues: PackValidationIssue[] };

function issue(path: string, message: string): PackValidationIssue {
  return { path, message };
}

function parseList<T>(
  label: string,
  schema: z.ZodType<T>,
  values: unknown[],
  issues: PackValidationIssue[]
): T[] {
  const out: T[] = [];
  values.forEach((value, index) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      issues.push(
        issue(
          `${label}[${index}]`,
          parsed.error.issues[0]?.message ?? "Invalid entry"
        )
      );
      return;
    }
    out.push(parsed.data);
  });
  return out;
}

/**
 * Validate a loaded pack. Enforces cross-file referential integrity and
 * confidential identity rules without relying on UI copy.
 */
export function validateSamplePack(input: {
  manifest: unknown;
  organisation: unknown;
  relationships: unknown;
  assignments: unknown;
  sessions: unknown;
  actions: unknown;
  developmentUpdates: unknown;
  intelligenceItems: unknown;
}): PackValidationResult {
  const issues: PackValidationIssue[] = [];

  const manifestParsed = samplePackManifestSchema.safeParse(input.manifest);
  if (!manifestParsed.success) {
    issues.push(
      issue(
        "manifest",
        manifestParsed.error.issues[0]?.message ?? "Invalid manifest"
      )
    );
  }

  const organisationParsed = sampleOrganisationSchema.safeParse(
    input.organisation
  );
  if (!organisationParsed.success) {
    issues.push(
      issue(
        "organisation",
        organisationParsed.error.issues[0]?.message ?? "Invalid organisation"
      )
    );
  }

  const relationshipRows = Array.isArray(
    (input.relationships as { relationships?: unknown })?.relationships
  )
    ? ((input.relationships as { relationships: unknown[] }).relationships)
    : Array.isArray(input.relationships)
      ? input.relationships
      : [];

  const assignmentRows = Array.isArray(
    (input.assignments as { assignments?: unknown })?.assignments
  )
    ? ((input.assignments as { assignments: unknown[] }).assignments)
    : Array.isArray(input.assignments)
      ? input.assignments
      : [];

  const sessionRows = Array.isArray(
    (input.sessions as { sessions?: unknown })?.sessions
  )
    ? ((input.sessions as { sessions: unknown[] }).sessions)
    : Array.isArray(input.sessions)
      ? input.sessions
      : [];

  const actionRows = Array.isArray(
    (input.actions as { actions?: unknown })?.actions
  )
    ? ((input.actions as { actions: unknown[] }).actions)
    : Array.isArray(input.actions)
      ? input.actions
      : [];

  const updateRows = Array.isArray(
    (input.developmentUpdates as { developmentUpdates?: unknown })
      ?.developmentUpdates
  )
    ? ((
        input.developmentUpdates as { developmentUpdates: unknown[] }
      ).developmentUpdates)
    : Array.isArray(input.developmentUpdates)
      ? input.developmentUpdates
      : [];

  const intelligenceRows = Array.isArray(
    (input.intelligenceItems as { intelligenceItems?: unknown })
      ?.intelligenceItems
  )
    ? ((
        input.intelligenceItems as { intelligenceItems: unknown[] }
      ).intelligenceItems)
    : Array.isArray(input.intelligenceItems)
      ? input.intelligenceItems
      : [];

  const relationships = parseList(
    "relationships",
    sampleRelationshipSchema,
    relationshipRows,
    issues
  ) as SampleRelationshipSpec[];
  const assignments = parseList(
    "assignments",
    sampleAssignmentSchema,
    assignmentRows,
    issues
  ) as SampleAssignmentSpec[];
  const sessions = parseList(
    "sessions",
    sampleSessionSchema,
    sessionRows,
    issues
  ) as SampleSessionSpec[];
  const actions = parseList(
    "actions",
    sampleActionSchema,
    actionRows,
    issues
  ) as SampleActionSpec[];
  const developmentUpdates = parseList(
    "developmentUpdates",
    sampleDevelopmentUpdateSchema,
    updateRows,
    issues
  ) as SampleDevelopmentUpdateSpec[];
  const intelligenceItems = parseList(
    "intelligenceItems",
    sampleIntelligenceItemSchema,
    intelligenceRows,
    issues
  ) as SampleIntelligenceItemSpec[];

  if (!manifestParsed.success || !organisationParsed.success || issues.length) {
    return { ok: false, issues };
  }

  const manifest = manifestParsed.data as SamplePackManifest;
  const organisation = organisationParsed.data as SampleOrganisationSpec;
  const relationshipKeys = new Set(relationships.map(r => r.key));
  const sessionKeys = new Set(sessions.map(s => s.key));

  if (relationships.length !== manifest.expectedCounts.relationships) {
    issues.push(
      issue(
        "relationships",
        `Expected ${manifest.expectedCounts.relationships} relationships, found ${relationships.length}`
      )
    );
  }

  const confidential = relationships.filter(r => r.identityMode === "confidential");
  const standard = relationships.filter(r => r.identityMode === "standard");
  if (confidential.length !== manifest.expectedCounts.confidentialRelationships) {
    issues.push(
      issue(
        "relationships",
        `Expected ${manifest.expectedCounts.confidentialRelationships} confidential relationships`
      )
    );
  }
  if (standard.length !== manifest.expectedCounts.standardRelationships) {
    issues.push(
      issue(
        "relationships",
        `Expected ${manifest.expectedCounts.standardRelationships} standard relationships`
      )
    );
  }

  for (const rel of relationships) {
    if (rel.identityMode === "confidential") {
      if (rel.email.trim()) {
        issues.push(
          issue(`relationships.${rel.key}`, "Confidential relationships must not include email")
        );
      }
      if (rel.aiNameAllowed) {
        issues.push(
          issue(`relationships.${rel.key}`, "Confidential relationships must set aiNameAllowed false")
        );
      }
    } else if (!rel.name.trim()) {
      issues.push(issue(`relationships.${rel.key}`, "Standard relationships require a name"));
    }
  }

  for (const assignment of assignments) {
    if (!relationshipKeys.has(assignment.relationshipKey)) {
      issues.push(
        issue(
          `assignments.${assignment.relationshipKey}`,
          "Assignment references unknown relationship"
        )
      );
    }
  }

  if (sessions.length !== manifest.expectedCounts.sessions) {
    issues.push(
      issue(
        "sessions",
        `Expected ${manifest.expectedCounts.sessions} sessions, found ${sessions.length}`
      )
    );
  }
  for (const session of sessions) {
    if (!relationshipKeys.has(session.relationshipKey)) {
      issues.push(
        issue(`sessions.${session.key}`, "Session references unknown relationship")
      );
    }
  }

  if (actions.length !== manifest.expectedCounts.actions) {
    issues.push(
      issue(
        "actions",
        `Expected ${manifest.expectedCounts.actions} actions, found ${actions.length}`
      )
    );
  }
  for (const action of actions) {
    if (!relationshipKeys.has(action.relationshipKey)) {
      issues.push(
        issue(`actions.${action.key}`, "Action references unknown relationship")
      );
    }
    if (!sessionKeys.has(action.sessionKey)) {
      issues.push(
        issue(`actions.${action.key}`, "Action references unknown session")
      );
    }
  }

  if (developmentUpdates.length !== manifest.expectedCounts.developmentUpdates) {
    issues.push(
      issue(
        "developmentUpdates",
        `Expected ${manifest.expectedCounts.developmentUpdates} development updates, found ${developmentUpdates.length}`
      )
    );
  }
  for (const update of developmentUpdates) {
    if (!relationshipKeys.has(update.relationshipKey)) {
      issues.push(
        issue(
          `developmentUpdates.${update.key}`,
          "Development update references unknown relationship"
        )
      );
    }
    if (!sessionKeys.has(update.sessionKey)) {
      issues.push(
        issue(
          `developmentUpdates.${update.key}`,
          "Development update references unknown session"
        )
      );
    }
  }

  if (intelligenceItems.length !== manifest.expectedCounts.intelligenceItems) {
    issues.push(
      issue(
        "intelligenceItems",
        `Expected ${manifest.expectedCounts.intelligenceItems} intelligence items, found ${intelligenceItems.length}`
      )
    );
  }
  for (const item of intelligenceItems) {
    if (!relationshipKeys.has(item.relationshipKey)) {
      issues.push(
        issue(
          `intelligenceItems.${item.key}`,
          "Intelligence item references unknown relationship"
        )
      );
    }
    if (!sessionKeys.has(item.sessionKey)) {
      issues.push(
        issue(
          `intelligenceItems.${item.key}`,
          "Intelligence item references unknown session"
        )
      );
    }
  }

  // Recurring themes must span enough relationships for privacy threshold.
  const threshold = manifest.privacy.minimumThemeRelationships;
  for (const theme of manifest.recurringThemes) {
    const count = relationships.filter(r => r.themes.includes(theme)).length;
    if (count < threshold) {
      issues.push(
        issue(
          `themes.${theme}`,
          `Theme must appear on at least ${threshold} relationships (found ${count})`
        )
      );
    }
  }

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    pack: {
      manifest,
      organisation,
      relationships,
      assignments,
      sessions,
      actions,
      developmentUpdates,
      intelligenceItems,
    },
  };
}
