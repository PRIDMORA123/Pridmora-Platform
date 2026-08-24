import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AI_SUBJECT_REFERENCE,
  cleanDerivedAiText,
  knownIdentitiesFromPublicClient,
  minimiseForExternalAi,
  REDACTED_EMAIL,
  REDACTED_ID,
  REDACTED_PHONE,
} from "@/lib/ai/minimise-for-external";
import { createPersonLevelResponse } from "@/lib/ai/person-level-openai";
import {
  buildRelationshipAiContext,
  formatRelationshipAiPersonContext,
} from "@/lib/relationship-identity";
import {
  buildWhyThisPayload,
  resolveVerifiedSourceExcerpt,
  type DevelopmentEvidenceObservation,
  type DevelopmentEvidenceRecord,
} from "@/lib/development-evidence";

const root = process.cwd();

const PERSON_LEVEL_AI_PATHS = [
  "app/api/coaching-intelligence/prepare/route.ts",
  "app/api/preparation/generate/route.ts",
  "app/api/draft-summary/route.ts",
  "app/api/coaching-questions/route.ts",
  "app/api/development-updates/generate/route.ts",
  "app/api/patterns/generate/route.ts",
  "app/api/coaching-report/route.ts",
  "app/api/identity-journey/route.ts",
  "app/api/development-reports/[reportId]/generate/route.ts",
  "app/api/coaching-moments/route.ts",
  "app/api/my-development/aurelia/chat/route.ts",
  "app/api/my-development/aurelia/propose-capture/route.ts",
  "lib/development-evidence/analyse.ts",
] as const;

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsFiles(full, out);
      continue;
    }
    if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const SUBJECT_BLOCKED = knownIdentitiesFromPublicClient({
  name: "Sarah Chen",
  displayLabel: "Sarah Chen",
  organisation: "Northbridge Trust",
  role: "Operations Manager",
  identityMode: "standard",
  aiNameAllowed: false,
});

const SUBJECT_ALLOWED = knownIdentitiesFromPublicClient({
  name: "Sarah Chen",
  displayLabel: "Sarah Chen",
  organisation: "Northbridge Trust",
  role: "Operations Manager",
  identityMode: "standard",
  aiNameAllowed: true,
});

const SUBJECT_WILLIAMS_BLOCKED = knownIdentitiesFromPublicClient({
  name: "Sarah Williams",
  displayLabel: "Sarah Williams",
  organisation: "Northbridge Trust",
  role: "Operations Manager",
  identityMode: "standard",
  aiNameAllowed: false,
});

const SUBJECT_WILLIAMS_ALLOWED = knownIdentitiesFromPublicClient({
  name: "Sarah Williams",
  displayLabel: "Sarah Williams",
  organisation: "Northbridge Trust",
  role: "Operations Manager",
  identityMode: "standard",
  aiNameAllowed: true,
});

function makeObservation(
  overrides: Partial<DevelopmentEvidenceObservation> & { id: string }
): DevelopmentEvidenceObservation {
  return {
    id: overrides.id,
    evidenceId: "ev-privacy-1",
    organisationId: "org-1",
    clientId: "client-1",
    title: overrides.title ?? "Observation",
    description: overrides.description ?? "Developmental meaning",
    category: null,
    behaviouralEvidence: overrides.behaviouralEvidence ?? null,
    developmentImplication: overrides.developmentImplication ?? null,
    sourceConfidence: "medium",
    assessmentContext: null,
    limitations: null,
    capabilityKey: null,
    includeInIntelligence: overrides.includeInIntelligence ?? true,
    reviewStatus: overrides.reviewStatus ?? "approved",
    sortOrder: 0,
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
  };
}

function makeRecord(
  overrides: Partial<DevelopmentEvidenceRecord> = {}
): DevelopmentEvidenceRecord {
  return {
    id: "ev-privacy-1",
    organisationId: "org-1",
    clientId: "client-1",
    evidenceType: "stakeholder_feedback",
    sourceType: "uploaded_document",
    title: "Feedback notes",
    sourceLabel: "Upload",
    evidenceDate: "2026-08-16",
    capturedAt: "2026-08-16T12:00:00.000Z",
    capturedBy: "user-1",
    originalDocumentId: "doc-1",
    freshnessClass: "current",
    includeInIntelligence: true,
    reviewStatus: "approved",
    processingStatus: "ready",
    restricted: false,
    capabilityKeys: [],
    contentHash: "hash-1",
    sourceRecordId: null,
    structuredEvidence: { observations: [] },
    sourceSummary: null,
    extractionVersion: "v1",
    purpose: null,
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("subject identity for external AI", () => {
  it("does not send the legal name when ai_name_allowed is false and display_label matches", () => {
    const context = buildRelationshipAiContext({
      name: "Sarah Chen",
      displayLabel: "Sarah Chen",
      identityMode: "standard",
      aiNameAllowed: false,
      role: "Operations Manager",
      organisation: "Northbridge Trust",
    });
    expect(context.aiDisplayName).toBe(AI_SUBJECT_REFERENCE);
    expect(context.allowedClientName).toBe("Sarah Chen");
    const formatted = formatRelationshipAiPersonContext(context).join("\n");
    expect(formatted).toContain(`Person reference: ${AI_SUBJECT_REFERENCE}`);
    expect(formatted).not.toContain("Sarah Chen");
  });

  it("uses [SUBJECT] in outbound copy when the legal name appears in notes", () => {
    const source =
      "Sarah Chen discussed timing with the delivery group.";
    const { text } = minimiseForExternalAi(source, SUBJECT_BLOCKED);
    expect(text).toContain(AI_SUBJECT_REFERENCE);
    expect(text).not.toContain("Sarah Chen");
    expect(source).toBe(
      "Sarah Chen discussed timing with the delivery group."
    );
  });

  it("keeps a genuinely distinct non-identifying display label", () => {
    const context = buildRelationshipAiContext({
      name: "Alex Rivera",
      displayLabel: "Ops programme",
      identityMode: "standard",
      aiNameAllowed: false,
      role: "Ops",
      organisation: "Trust",
    });
    expect(context.aiDisplayName).toBe("Ops programme");
    expect(context.aiDisplayName).not.toBe("Alex Rivera");
  });

  it("sends the preferred name only when ai_name_allowed is true", () => {
    const context = buildRelationshipAiContext({
      name: "Sarah Chen",
      displayLabel: "Sarah Chen",
      identityMode: "standard",
      aiNameAllowed: true,
      role: "Operations Manager",
      organisation: "Northbridge Trust",
    });
    expect(context.aiDisplayName).toBe("Sarah Chen");
    const { text } = minimiseForExternalAi(
      "Sarah Chen discussed timing.",
      SUBJECT_ALLOWED
    );
    expect(text).toContain("Sarah Chen");
    expect(text).not.toContain(AI_SUBJECT_REFERENCE);
  });

  it("replaces obvious known-subject variants without leaving last-name fragments", () => {
    const cases = [
      "Sarah Williams discussed timing.",
      "SARAH WILLIAMS discussed timing.",
      "sarah williams discussed timing.",
      "Sarah-Williams discussed timing.",
      "Sarah O'Williams discussed timing.",
      "Sarah Williams spoke. Later Sarah agreed.",
    ];
    for (const source of cases) {
      const { text } = minimiseForExternalAi(source, SUBJECT_WILLIAMS_BLOCKED);
      expect(text, source).toContain(AI_SUBJECT_REFERENCE);
      expect(text, source).not.toMatch(/Sarah[- ]?Williams/i);
      expect(text, source).not.toContain("Williams");
      expect(text, source).not.toContain("O'Williams");
    }
  });

  it("still sends the preferred name when ai_name_allowed is true", () => {
    const { text } = minimiseForExternalAi(
      "Sarah Williams discussed timing.",
      SUBJECT_WILLIAMS_ALLOWED
    );
    expect(text).toContain("Sarah Williams");
    expect(text).not.toContain(AI_SUBJECT_REFERENCE);
  });
});

describe("adversarial fixtures — outbound minimisation", () => {
  it("replaces detected James Wilson with a request-scoped person token", () => {
    const source = "James Wilson raised a delivery concern in the review.";
    const { text, mapping } = minimiseForExternalAi(source);
    expect(source).toBe(
      "James Wilson raised a delivery concern in the review."
    );
    expect(text).not.toContain("James Wilson");
    expect(text).toContain("[PERSON 1]");
    expect(mapping.people).toHaveLength(1);
    expect(mapping.people[0]?.originals).toContain("James Wilson");
  });

  it("keeps later James references coherent with James Wilson", () => {
    const source =
      "James Wilson spoke first. Later James agreed the date should move.";
    const { text, mapping } = minimiseForExternalAi(source);
    expect(text).not.toContain("James Wilson");
    expect(text).not.toMatch(/\bJames\b/);
    expect(mapping.people).toHaveLength(1);
    expect((text.match(/\[PERSON 1\]/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps James Wilson and Sarah Jones distinguishable", () => {
    const source =
      "James Wilson raised the risk. Sarah Jones challenged the timeline.";
    const { text, mapping } = minimiseForExternalAi(source);
    expect(text).not.toContain("James Wilson");
    expect(text).not.toContain("Sarah Jones");
    expect(text).toContain("[PERSON 1]");
    expect(text).toContain("[PERSON 2]");
    expect(mapping.people).toHaveLength(2);
    expect(text.indexOf("[PERSON 1]")).toBeLessThan(text.indexOf("[PERSON 2]"));
  });

  it("keeps repeated first names bound to the same request-scoped people", () => {
    const source =
      "James Wilson raised the risk. Sarah Jones challenged it. James then asked Sarah for the numbers.";
    const { text, mapping } = minimiseForExternalAi(source);
    expect(mapping.people).toHaveLength(2);
    expect(text).not.toMatch(/\bJames\b/);
    expect(text).not.toMatch(/\bSarah\b/);
    expect((text.match(/\[PERSON 1\]/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((text.match(/\[PERSON 2\]/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("redacts an email address", () => {
    const source =
      "Please follow up with james.wilson@example.com after the session.";
    const { text } = minimiseForExternalAi(source);
    expect(text).toContain(REDACTED_EMAIL);
    expect(text).not.toContain("james.wilson@example.com");
    expect(source).toContain("james.wilson@example.com");
  });

  it("redacts a UK mobile number", () => {
    const source = "Call the office on 07700 900123 if the slot moves.";
    const { text } = minimiseForExternalAi(source);
    expect(text).toContain(REDACTED_PHONE);
    expect(text).not.toContain("07700 900123");
    expect(source).toContain("07700 900123");
  });

  it("redacts or removes an unnecessary UUID", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const source = `Internal record ${uuid} must not leave the workspace.`;
    const { text } = minimiseForExternalAi(source);
    expect(text).not.toContain(uuid);
    expect(text).toContain(REDACTED_ID);
    expect(source).toContain(uuid);
  });

  it("redacts the subject legal name when it is not opted in", () => {
    const source = "Sarah Chen asked James Wilson to pause the rollout.";
    const { text } = minimiseForExternalAi(source, SUBJECT_BLOCKED);
    expect(text).toContain(AI_SUBJECT_REFERENCE);
    expect(text).not.toContain("Sarah Chen");
    expect(text).toContain("[PERSON 1]");
    expect(text).not.toContain("James Wilson");
  });

  it("does not treat a confidential display label as a third-party legal name", () => {
    const identities = knownIdentitiesFromPublicClient({
      name: "Ops programme",
      displayLabel: "Ops programme",
      organisation: "Northbridge Trust",
      role: "Lead",
      identityMode: "confidential",
      aiNameAllowed: false,
    });
    const source = "Prep notes for the Ops programme this week.";
    const { text } = minimiseForExternalAi(source, identities);
    expect(text).toContain("Ops programme");
    expect(text).not.toContain(AI_SUBJECT_REFERENCE);
    expect(text).not.toContain("[PERSON 1]");
  });

  it("applies case-insensitive replacement for known subject names", () => {
    const source = "SARAH CHEN followed up after the review.";
    const { text } = minimiseForExternalAi(source, SUBJECT_BLOCKED);
    expect(text).toContain(AI_SUBJECT_REFERENCE);
    expect(text).not.toContain("SARAH CHEN");
    expect(text).not.toContain("Sarah Chen");
  });

  it("does not treat heading lines separated by a newline as a person name", () => {
    const source = "Current development focuses:\n- Delegation\n\nActive development actions:";
    const { text, mapping } = minimiseForExternalAi(source);
    expect(text).toContain("Delegation");
    expect(text).toContain("Active development actions:");
    expect(mapping.people).toHaveLength(0);
  });

  it("does not claim heuristic detection of uncapitalised or all-caps unknown full names", () => {
    const lower = "james wilson raised a delivery concern in the review.";
    const { text: lowerText } = minimiseForExternalAi(lower);
    expect(lowerText).toContain("james wilson");
    expect(lowerText).not.toContain("[PERSON 1]");

    const upper = "JAMES WILSON raised a delivery concern in the review.";
    const { text: upperText } = minimiseForExternalAi(upper);
    expect(upperText).toContain("JAMES WILSON");
    expect(upperText).not.toContain("[PERSON 1]");
  });
});

describe("derived AI output privacy cleaner", () => {
  it("does not restore James Wilson and does not leave raw person tokens", () => {
    const source = "James Wilson raised a delivery concern.";
    const { mapping } = minimiseForExternalAi(source);
    const cleaned = cleanDerivedAiText(
      "[PERSON 1] should follow up. James Wilson agreed.",
      mapping
    );
    expect(cleaned).not.toContain("James Wilson");
    expect(cleaned).not.toMatch(/\[PERSON\s+\d+\]/i);
    expect(cleaned).toContain("a team member");
  });

  it("keeps multiple people readable and distinct", () => {
    const source =
      "James Wilson raised the risk. Sarah Jones challenged the timeline.";
    const { mapping } = minimiseForExternalAi(source);
    const cleaned = cleanDerivedAiText(
      "[PERSON 1] raised the risk and [PERSON 2] challenged the timeline.",
      mapping
    );
    expect(cleaned).toContain("a team member");
    expect(cleaned).toContain("another colleague");
    expect(cleaned).not.toContain("James Wilson");
    expect(cleaned).not.toContain("Sarah Jones");
    expect(cleaned).not.toMatch(/\[PERSON\s+\d+\]/i);
  });

  it("neutralises leftover subject tokens into readable wording", () => {
    const cleaned = cleanDerivedAiText(
      `${AI_SUBJECT_REFERENCE} held the meeting.`,
      { subjectOriginals: ["Sarah Chen"], people: [] }
    );
    expect(cleaned).toBe("the person held the meeting.");
    expect(cleaned).not.toContain("Sarah Chen");
    expect(cleaned).not.toContain(AI_SUBJECT_REFERENCE);
  });
});

describe("person-level OpenAI wrapper outbound behaviour", () => {
  it("minimises a copy, sets store: false, and cleans derived text", async () => {
    const originalNotes =
      "James Wilson emailed james.wilson@example.com and copied Sarah Jones.";
    type OutboundCreateArgs = {
      store?: boolean;
      input?: string;
      instructions?: string;
    };
    let captured: OutboundCreateArgs | undefined;
    const openai = {
      responses: {
        create: vi.fn(async (args: OutboundCreateArgs) => {
          captured = args;
          return {
            id: "resp_test",
            output_text:
              "James Wilson should meet [PERSON 2] after the review.",
          };
        }),
      },
    };

    const result = await createPersonLevelResponse(
      openai as never,
      {
        model: "gpt-5.5",
        instructions: "Write a short coaching observation.",
        input: originalNotes,
      },
      SUBJECT_BLOCKED
    );

    expect(originalNotes).toBe(
      "James Wilson emailed james.wilson@example.com and copied Sarah Jones."
    );
    expect(captured?.store).toBe(false);
    expect(captured?.input).not.toContain("James Wilson");
    expect(captured?.input).not.toContain("Sarah Jones");
    expect(captured?.input).not.toContain("james.wilson@example.com");
    expect(captured?.input).toContain("[PERSON 1]");
    expect(captured?.input).toContain("[PERSON 2]");
    expect(captured?.input).toContain(REDACTED_EMAIL);
    expect(result.output_text).not.toContain("James Wilson");
    expect(result.output_text).not.toContain("Sarah Jones");
    expect(result.output_text).not.toMatch(/\[PERSON\s+\d+\]/i);
    expect(result.output_text.toLowerCase()).toContain("team member");
  });

  it("redacts phone and UUID from the outbound payload", async () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const originalNotes = `Call 07700 900123 about record ${uuid}.`;
    let capturedInput = "";
    const openai = {
      responses: {
        create: vi.fn(async (args: { input: string }) => {
          capturedInput = args.input;
          return { id: "resp_ids", output_text: "Follow up this week." };
        }),
      },
    };

    await createPersonLevelResponse(
      openai as never,
      {
        model: "gpt-5.5",
        instructions: "Summarise.",
        input: originalNotes,
      }
    );

    expect(originalNotes).toContain("07700 900123");
    expect(originalNotes).toContain(uuid);
    expect(capturedInput).not.toContain("07700 900123");
    expect(capturedInput).not.toContain(uuid);
    expect(capturedInput).toContain(REDACTED_PHONE);
    expect(capturedInput).toContain(REDACTED_ID);
  });
});

describe("original evidence and Why this? traceability", () => {
  it("leaves original source text string-equivalent after minimisation", () => {
    const original =
      "James Wilson told Sarah Chen that 07700 900123 and james.wilson@example.com were the contacts.";
    const snapshot = original;
    minimiseForExternalAi(original, SUBJECT_BLOCKED);
    expect(original).toBe(snapshot);
    expect(original).toContain("James Wilson");
    expect(original).toContain("Sarah Chen");
    expect(original).toContain("07700 900123");
    expect(original).toContain("james.wilson@example.com");
  });

  it("still exposes the authorised original source through Why this? excerpts", () => {
    const extractedText =
      "James Wilson raised delivery concerns early in the stakeholder review.";
    const excerpt = resolveVerifiedSourceExcerpt({
      extractedText,
      behaviouralEvidence: "James Wilson raised delivery concerns early",
    });
    expect(excerpt.matchKind).toBe("exact_behavioural");
    expect(excerpt.excerpt).toContain("James Wilson");
    expect(extractedText).toContain("James Wilson");

    const why = buildWhyThisPayload({
      insight: "Delivery concerns",
      records: [makeRecord()],
      observations: [
        makeObservation({
          id: "obs-1",
          behaviouralEvidence: "James Wilson raised delivery concerns early",
          developmentImplication: "Invite concerns earlier.",
        }),
      ],
    });
    expect(why.supportingSources[0]?.drilldownPath).toBe("evidence:ev-privacy-1");
    expect(why.observedBehaviours.join(" ")).toContain("James Wilson");
  });
});

describe("workflow coverage and vault exclusion", () => {
  it("routes every approved person-level workflow through the shared boundary", () => {
    for (const path of PERSON_LEVEL_AI_PATHS) {
      const source = read(path);
      expect(source, path).toMatch(
        /createPersonLevelResponse|createPersonLevelChatCompletion/
      );
      expect(source, path).not.toContain("openai.responses.create");
      expect(source, path).not.toContain("openai.chat.completions.create");
    }
  });

  it("does not query Identity Vault or private identity from AI routes", () => {
    const productionFiles = [
      ...walkTsFiles(join(root, "app")),
      ...walkTsFiles(join(root, "lib")),
    ];
    const vaultHits: string[] = [];
    for (const abs of productionFiles) {
      const rel = abs.replace(`${root}/`, "");
      if (rel === "lib/private-identity.ts") continue;
      if (rel === "app/api/clients/[clientId]/private-identity/route.ts") {
        continue;
      }
      const source = readFileSync(abs, "utf8");
      if (
        source.includes("fetchPrivateIdentity") ||
        source.includes("client_private_identities")
      ) {
        vaultHits.push(rel);
      }
    }
    expect(vaultHits).toEqual([]);
    for (const path of PERSON_LEVEL_AI_PATHS) {
      const source = read(path);
      expect(source, path).not.toContain("fetchPrivateIdentity");
      expect(source, path).not.toContain("client_private_identities");
    }
  });

  it("leaves Organisation Intelligence on its own OpenAI path", () => {
    const source = read("lib/organisation-intelligence/generate.ts");
    expect(source).not.toContain("createPersonLevelResponse");
    expect(source).not.toContain("createPersonLevelChatCompletion");
    expect(source).not.toContain("minimiseForExternalAi");
    expect(source).toContain("openai.responses.create");
    expect(source).toContain("store: false");
  });

  it("does not put Development Journey relationshipId UUID into the AI prompt", () => {
    const source = read("app/api/identity-journey/route.ts");
    expect(source).toContain("Conversation ${index + 1}");
    expect(source).not.toMatch(/`relationshipId:\s*\$\{relationshipId\}`/);
    expect(source).not.toMatch(/relationshipId:\s*\$\{relationshipId\}/);
  });

  it("routes Northbridge pack rebuild through the person-level privacy boundary", () => {
    const source = read("scripts/rebuild-northbridge-production-pack.mjs");
    expect(source).toContain("createPersonLevelResponse");
    expect(source).toContain("knownIdentitiesFromPublicClient");
    expect(source).not.toContain("openai.responses.create");
    expect(source).not.toContain("openai.chat.completions.create");
    expect(source).not.toContain("fetchPrivateIdentity");
    expect(source).not.toContain("client_private_identities");
    expect(read("lib/ai/person-level-openai.ts")).toContain("store: false");
  });

  it("does not alter Why this? to depend on privacy tokens", () => {
    const source = read(
      "lib/development-evidence/intelligence-view-model.ts"
    );
    expect(source).toContain("buildWhyThisPayload");
    expect(source).not.toContain("minimiseForExternalAi");
    expect(source).not.toContain("cleanDerivedAiText");
  });
});
