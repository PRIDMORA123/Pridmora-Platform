import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  assertNoForbiddenEvidenceAiFields,
  buildEvidenceAiContext,
  calculateEvidenceConfidence,
  calculateEvidenceCoverage,
  calculateEvidenceFreshness,
  buildDevelopmentIntelligenceEvidenceView,
  buildEvidenceGraph,
  buildPremiumExecutiveBrief,
  buildTeamIntelligenceView,
  extractEvidenceDocumentText,
  hashEvidenceBytes,
  isSupportedEvidenceUpload,
  isUnusablePdfExtract,
  preferenceFramedSummary,
  sanitizeEvidenceTextForAi,
  surfaceAssessmentBehaviourConflict,
  assertPsychometricLanguageSafe,
  FORBIDDEN_EVIDENCE_AI_FIELD_NAMES,
  type DevelopmentEvidenceRecord,
} from "@/lib/development-evidence";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function makeEvidence(
  overrides: Partial<DevelopmentEvidenceRecord> & {
    id: string;
    evidenceType: DevelopmentEvidenceRecord["evidenceType"];
  }
): DevelopmentEvidenceRecord {
  return {
    organisationId: "org-1",
    clientId: "client-1",
    sourceType: "uploaded_document",
    sourceRecordId: null,
    title: overrides.title ?? "Evidence",
    evidenceDate: "2026-06-01",
    capturedAt: "2026-06-01T10:00:00.000Z",
    capturedBy: "user-1",
    originalDocumentId: null,
    processingStatus: "ready",
    reviewStatus: "approved",
    includeInIntelligence: true,
    structuredEvidence: {
      observations: [
        {
          title: "Observed behaviour",
          description: "Specific workplace behaviour was noted.",
          behaviouralEvidence: "Spoke up in the stakeholder meeting.",
        },
      ],
      strengthSignals: ["Clearer communication"],
      developmentSignals: ["Earlier feedback conversations"],
      contradictoryEvidence: [],
    },
    sourceSummary: "Reviewed evidence summary",
    freshnessClass: "current",
    restricted: false,
    contentHash: overrides.contentHash ?? overrides.id,
    extractionVersion: "v1",
    purpose: "Development planning",
    sourceLabel: "Upload",
    capabilityKeys: overrides.capabilityKeys ?? ["communication"],
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("Development Evidence identity protection", () => {
  it("never includes private identity fields in evidence AI context", () => {
    const context = buildEvidenceAiContext({
      client: {
        name: "Public Label",
        role: "Manager",
        organisation: "Averly",
        identityMode: "confidential",
        displayLabel: "Senior Leader A",
        confidentialReference: "C-AB12CD",
        aiNameAllowed: false,
      },
      privateIdentity: {
        realName: "Hidden Person",
        email: "hidden@example.com",
        phone: "+44 7700 900123",
        privateNotes: "private note",
      },
      document: {
        fileName: "feedback.txt",
        evidenceType: "feedback_360",
        extractedText:
          "Contact Hidden Person at hidden@example.com or +44 7700 900123 for details.",
      },
    });

    expect(context.serialisedPayload).not.toMatch(/Hidden Person/i);
    expect(context.serialisedPayload).not.toMatch(/hidden@example.com/i);
    expect(context.serialisedPayload).not.toMatch(/7700 900123/);
    expect(context.serialisedPayload).toContain("Senior Leader A");
  });

  it("minimises standard-mode identifiers and redacts emails/phones from document text", () => {
    const sanitized = sanitizeEvidenceTextForAi(
      "Email jane.doe@company.com or call 020 7946 0958 about the PDP."
    );
    expect(sanitized).toContain("[redacted-email]");
    expect(sanitized).toContain("[redacted-phone]");
    expect(sanitized).not.toContain("jane.doe@company.com");
  });

  it("fails if forbidden private identity fields are added to AI payload objects", () => {
    expect(() =>
      assertNoForbiddenEvidenceAiFields({
        aiDisplayName: "Sophie",
        email: "should-not-be-here@example.com",
      })
    ).toThrow(/forbidden field: email/i);

    expect(FORBIDDEN_EVIDENCE_AI_FIELD_NAMES).toContain("realName");
    expect(FORBIDDEN_EVIDENCE_AI_FIELD_NAMES).toContain("phone");
  });

  it("uses public label for confidential relationships", () => {
    const context = buildEvidenceAiContext({
      client: {
        name: "Should Not Appear",
        identityMode: "confidential",
        displayLabel: "Manager B",
        confidentialReference: "C-ZZ99YY",
      },
      document: {
        evidenceType: "personal_reflection",
        extractedText: "Reflection about stakeholder meetings.",
      },
    });
    expect(context.relationship.aiDisplayName).toBe("Manager B");
    expect(context.serialisedPayload).not.toContain("Should Not Appear");
  });
});

describe("Development Evidence uploads and extraction", () => {
  it("accepts supported uploads and rejects unsupported types", () => {
    expect(
      isSupportedEvidenceUpload({
        fileName: "notes.txt",
        mimeType: "text/plain",
        byteSize: 120,
      }).ok
    ).toBe(true);

    expect(
      isSupportedEvidenceUpload({
        fileName: "scan.png",
        mimeType: "image/png",
        byteSize: 120,
      }).ok
    ).toBe(false);
  });

  it("extracts plain text safely", async () => {
    const bytes = new TextEncoder().encode(
      "Fictional 360 summary: clearer expectations were observed."
    );
    const result = await extractEvidenceDocumentText({
      fileName: "360.txt",
      mimeType: "text/plain",
      bytes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain("clearer expectations");
    }
  });

  it("bounds binary PDF extraction scan window", async () => {
    const { EXTRACT_BINARY_SCAN_BYTES } = await import(
      "@/lib/development-evidence/extract"
    );
    expect(EXTRACT_BINARY_SCAN_BYTES).toBeLessThanOrEqual(512 * 1024);

    // Oversized pseudo-PDF should still return promptly (failed or extracted),
    // not hang on a full multi‑MB sync scan.
    const huge = new Uint8Array(2 * 1024 * 1024);
    huge.set(new TextEncoder().encode("%PDF-1.4\nBT (hello) Tj ET\n"), 0);
    const started = Date.now();
    const result = await extractEvidenceDocumentText({
      fileName: "large.pdf",
      mimeType: "application/pdf",
      bytes: huge,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it("rejects unusable PDF structural/binary extract as failed", async () => {
    const noise =
      "%PDF-1.4 endobj endstream /Filter /Standard xref " +
      "obj stream Encrypt binary%%%%".repeat(40);
    expect(isUnusablePdfExtract(noise)).toBe(true);

    const readable =
      "DISC profile summary. Dominance is elevated. Influence and Steady " +
      "styles appear moderate. Conscientiousness supports detail focus. " +
      "Development themes include pacing decisions and inviting dissent. ".repeat(
        3
      );
    expect(isUnusablePdfExtract(readable)).toBe(false);

    const bytes = new TextEncoder().encode(noise);
    const result = await extractEvidenceDocumentText({
      fileName: "protected-disc.pdf",
      mimeType: "application/pdf",
      bytes,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("failed");
      expect(result.error).toMatch(/readable text|text-based PDF/i);
    }
  });

  it("analyse path marks failure without discarding evidence helpers", () => {
    const analyse = read("lib/development-evidence/analyse.ts");
    const repo = read("lib/development-evidence/repository.ts");
    expect(analyse).toContain("AbortSignal.timeout");
    expect(analyse).toContain("markEvidenceAnalysisFailed");
    expect(analyse).toContain("too limited for reliable analysis");
    expect(analyse).toContain("isAnalyseTimeoutError");
    expect(repo).toContain("markEvidenceAnalysisFailed");
    expect(repo).toContain("updateDocumentExtraction");
    expect(repo).toContain('processing_status: "failed"');
  });

  it("hashes document bytes for re-analysis prevention", async () => {
    const bytes = new TextEncoder().encode("same document");
    const a = await hashEvidenceBytes(bytes);
    const b = await hashEvidenceBytes(bytes);
    expect(a).toBe(b);
  });
});

describe("Psychometric handling", () => {
  it("frames DISC as preference evidence", () => {
    const text = preferenceFramedSummary({
      evidenceType: "disc",
      theme: "direct, fast-paced decision making",
      supportingBehaviour: "under operational pressure",
    });
    expect(text).toMatch(/suggests a preference/i);
    expect(text).not.toMatch(/you are a high/i);
  });

  it("rejects diagnostic or promotion language", () => {
    const check = assertPsychometricLanguageSafe(
      "You are a High D so you are ready for promotion"
    );
    expect(check.ok).toBe(false);
  });

  it("surfaces conflicting behavioural evidence", () => {
    const text = surfaceAssessmentBehaviourConflict({
      assessmentSignal: "a strong preference for social interaction",
      behaviouralSignal: "reduced visibility in stakeholder meetings",
    });
    expect(text).toMatch(/does not establish why these differ/i);
  });
});

describe("Evidence Confidence", () => {
  it("scopes the empty-library basis to Development Evidence items", () => {
    const empty = calculateEvidenceConfidence({ evidence: [] });
    expect(empty.level).toBe("low");
    expect(empty.independentSourceCount).toBe(0);
    expect(empty.basis).toBe(
      "No reviewed Development Evidence items are currently included."
    );
    expect(empty.basis).not.toMatch(/Development Intelligence/i);
  });

  it("strengthens with independent sources and stays low for duplicates", () => {
    const independent = calculateEvidenceConfidence({
      evidence: [
        {
          id: "1",
          evidenceType: "development_conversation",
          sourceType: "internal_reference",
          freshnessClass: "current",
          includeInIntelligence: true,
          reviewStatus: "approved",
          independenceKey: "conversation-1",
          hasBehaviouralSpecificity: true,
          capabilityKeys: ["delegation"],
        },
        {
          id: "2",
          evidenceType: "feedback_360",
          sourceType: "uploaded_document",
          freshnessClass: "current",
          includeInIntelligence: true,
          reviewStatus: "approved",
          independenceKey: "360-1",
          hasBehaviouralSpecificity: true,
          capabilityKeys: ["delegation"],
        },
        {
          id: "3",
          evidenceType: "reflection",
          sourceType: "manual_entry",
          freshnessClass: "current",
          includeInIntelligence: true,
          reviewStatus: "approved",
          independenceKey: "reflection-1",
          hasBehaviouralSpecificity: true,
          capabilityKeys: ["delegation"],
        },
        {
          id: "4",
          evidenceType: "leadership_assessment",
          sourceType: "uploaded_document",
          freshnessClass: "current",
          includeInIntelligence: true,
          reviewStatus: "approved",
          independenceKey: "assess-1",
          hasBehaviouralSpecificity: true,
          capabilityKeys: ["delegation"],
        },
      ],
    });
    expect(["moderate", "strong"]).toContain(independent.level);

    const duplicates = calculateEvidenceConfidence({
      evidence: Array.from({ length: 20 }, (_, index) => ({
        id: `dup-${index}`,
        evidenceType: "reflection" as const,
        sourceType: "manual_entry",
        freshnessClass: "current" as const,
        includeInIntelligence: true,
        reviewStatus: "approved",
        independenceKey: "same-note",
        hasBehaviouralSpecificity: false,
        capabilityKeys: ["communication"],
      })),
    });
    expect(duplicates.level).toBe("low");
    expect(duplicates.independentSourceCount).toBe(1);
  });

  it("keeps one thin source limited and lowers relevance for stale evidence", () => {
    const thin = calculateEvidenceConfidence({
      evidence: [
        {
          id: "thin",
          evidenceType: "other_document",
          sourceType: "uploaded_document",
          freshnessClass: "current",
          includeInIntelligence: true,
          reviewStatus: "approved",
          independenceKey: "thin-1",
          hasBehaviouralSpecificity: false,
        },
      ],
    });
    expect(thin.level).toBe("low");

    const stale = calculateEvidenceConfidence({
      evidence: [
        {
          id: "s1",
          evidenceType: "development_conversation",
          sourceType: "internal_reference",
          freshnessClass: "historic",
          includeInIntelligence: true,
          reviewStatus: "approved",
          independenceKey: "h1",
          hasBehaviouralSpecificity: true,
        },
        {
          id: "s2",
          evidenceType: "feedback_360",
          sourceType: "uploaded_document",
          freshnessClass: "historic",
          includeInIntelligence: true,
          reviewStatus: "approved",
          independenceKey: "h2",
          hasBehaviouralSpecificity: true,
        },
      ],
    });
    expect(stale.factors.relevanceScore).toBeLessThan(0.5);
  });

  it("reduces certainty when contradictions are present", () => {
    const mixed = calculateEvidenceConfidence({
      evidence: [
        {
          id: "1",
          evidenceType: "disc",
          sourceType: "uploaded_document",
          freshnessClass: "current",
          includeInIntelligence: true,
          reviewStatus: "approved",
          independenceKey: "a",
          hasBehaviouralSpecificity: true,
          contradictionCount: 2,
        },
        {
          id: "2",
          evidenceType: "development_conversation",
          sourceType: "internal_reference",
          freshnessClass: "current",
          includeInIntelligence: true,
          reviewStatus: "approved",
          independenceKey: "b",
          hasBehaviouralSpecificity: true,
          contradictionCount: 1,
        },
      ],
    });
    expect(mixed.level).not.toBe("strong");
  });
});

describe("Evidence Coverage and freshness", () => {
  it("returns limited/developing/broad without synthetic percentages", () => {
    const limited = calculateEvidenceCoverage([
      {
        evidenceType: "development_conversation",
        includeInIntelligence: true,
        reviewStatus: "approved",
      },
    ]);
    expect(limited.level).toBe("limited");
    expect(JSON.stringify(limited)).not.toMatch(/%/);

    const developing = calculateEvidenceCoverage([
      {
        evidenceType: "development_conversation",
        includeInIntelligence: true,
        reviewStatus: "approved",
      },
      {
        evidenceType: "feedback_360",
        includeInIntelligence: true,
        reviewStatus: "approved",
      },
      {
        evidenceType: "reflection",
        includeInIntelligence: true,
        reviewStatus: "approved",
      },
    ]);
    expect(developing.level).toBe("developing");

    const broad = calculateEvidenceCoverage([
      {
        evidenceType: "development_conversation",
        includeInIntelligence: true,
        reviewStatus: "approved",
      },
      {
        evidenceType: "reflection",
        includeInIntelligence: true,
        reviewStatus: "approved",
      },
      {
        evidenceType: "feedback_360",
        includeInIntelligence: true,
        reviewStatus: "approved",
      },
      {
        evidenceType: "leadership_assessment",
        includeInIntelligence: true,
        reviewStatus: "approved",
      },
      {
        evidenceType: "manager_observation",
        includeInIntelligence: true,
        reviewStatus: "approved",
      },
      {
        evidenceType: "action",
        includeInIntelligence: true,
        reviewStatus: "approved",
      },
    ]);
    expect(broad.level).toBe("broad");
  });

  it("classifies freshness by evidence type windows", () => {
    const now = new Date("2026-08-07T00:00:00.000Z");
    expect(
      calculateEvidenceFreshness({
        evidenceType: "reflection",
        evidenceDate: "2026-07-01",
        now,
      })
    ).toBe("current");
    expect(
      calculateEvidenceFreshness({
        evidenceType: "reflection",
        evidenceDate: "2025-01-01",
        now,
      })
    ).toBe("historic");
  });
});

describe("Development Intelligence evidence contribution", () => {
  it("only includes reviewed evidence and shows contradictions / missing evidence", () => {
    const view = buildDevelopmentIntelligenceEvidenceView({
      records: [
        makeEvidence({
          id: "approved",
          evidenceType: "feedback_360",
          includeInIntelligence: true,
          reviewStatus: "approved",
          capabilityKeys: ["feedback_difficult_conversations"],
          structuredEvidence: {
            strengthSignals: ["Clearer expectation-setting"],
            developmentSignals: ["Earlier performance conversations"],
            contradictoryEvidence: [
              "Assessment preference differs from recent meeting visibility.",
            ],
            observations: [
              {
                title: "Clearer expectations",
                description: "Peers note clearer standards.",
                behaviouralEvidence: "Weekly priorities stated explicitly.",
              },
            ],
          },
        }),
        makeEvidence({
          id: "pending",
          evidenceType: "disc",
          includeInIntelligence: false,
          reviewStatus: "pending_review",
          title: "Unreviewed DISC",
        }),
      ],
      currentFocus: "Lead former peers with clear expectations",
    });

    expect(view.recentEvidence.map(item => item.id)).toContain("approved");
    expect(view.recentEvidence.map(item => item.id)).not.toContain("pending");
    expect(view.missingOrConflicting.join(" ")).toMatch(/differ|not yet represented/i);
    expect(view.evidenceCoverage.level).toBeTruthy();
  });

  it("builds a navigable evidence graph", () => {
    const graph = buildEvidenceGraph([
      makeEvidence({
        id: "e1",
        evidenceType: "leadership_assessment",
        capabilityKeys: ["strategic_thinking", "delegation"],
      }),
      makeEvidence({
        id: "e2",
        evidenceType: "development_conversation",
        capabilityKeys: ["strategic_thinking"],
      }),
    ]);
    const strategic = graph.find(node => node.capabilityKey === "strategic_thinking");
    expect(strategic?.supportingEvidence.length).toBe(2);
    expect(strategic?.relatedCapabilities.length).toBeGreaterThan(0);
  });
});

describe("Team and Organisation evidence aggregation", () => {
  it("aggregates team intelligence without ranking or confidential content", () => {
    const view = buildTeamIntelligenceView({
      members: [
        {
          relationshipId: "r1",
          publicLabel: "Sophie Bennett",
          identityMode: "standard",
          evidence: [
            makeEvidence({
              id: "s1",
              evidenceType: "feedback_360",
              capabilityKeys: ["delegation"],
              structuredEvidence: {
                strengthSignals: ["Clearer expectation-setting"],
                developmentSignals: ["Earlier performance conversations"],
              },
            }),
          ],
        },
        {
          relationshipId: "r2",
          publicLabel: "Senior Leader A",
          identityMode: "confidential",
          evidence: [
            makeEvidence({
              id: "c1",
              clientId: "confidential",
              evidenceType: "leadership_assessment",
              restricted: true,
              capabilityKeys: ["strategic_thinking"],
              structuredEvidence: {
                strengthSignals: ["Should not appear in team content"],
              },
            }),
          ],
        },
      ],
    });

    expect(view.privacyNote).toMatch(/not ranked/i);
    expect(JSON.stringify(view)).not.toMatch(/weakest/i);
    expect(view.shareableStrengths.join(" ")).not.toMatch(/Should not appear/);
  });

  it("builds a premium executive brief with evidence honesty", () => {
    const brief = buildPremiumExecutiveBrief({
      organisationName: "Averly Services Group",
      periodLabel: "Last 90 days",
      confidenceLevel: "moderate",
      sourceRelationshipCount: 8,
      sourceConversationCount: 40,
      sourceEvidenceCount: 55,
      strengthening: ["Delegation"],
      attention: ["Feedback & Difficult Conversations"],
      strongEvidenceAreas: ["Delegation"],
      limitedEvidenceAreas: ["Systems Thinking"],
      recommendations: [
        {
          title: "Review performance conversation support",
          recommendation:
            "Consider focused practice for earlier performance conversations in Customer Services.",
          confidenceLevel: "moderate",
        },
      ],
    });

    expect(brief.sections.map(section => section.key)).toContain(
      "what_is_changing"
    );
    expect(brief.plainText).toMatch(/Evidence Confidence/i);
    expect(brief.plainText).not.toMatch(/promot(e|ion)/i);
    expect(brief.plainText).toMatch(/premature|limited|Consider/i);
  });
});

describe("Architecture and product wiring", () => {
  it("has additive migration with RLS and required indexes", () => {
    const sql = read(
      "supabase/migrations/20260807140000_development_evidence.sql"
    );
    expect(sql).toContain("create table if not exists public.development_evidence");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("user_can_access_client_content");
    expect(sql).toContain("development_evidence_organisation_id_idx");
    expect(sql).toContain("development_evidence_client_id_idx");
    expect(sql).toContain("development_evidence_review_status_idx");
    expect(sql).toContain("organisation_frameworks");
    expect(sql).toContain("evidence_uploaded");
    expect(sql).toContain("user_can_access_client_content(client_id, auth.uid())");
  });

  it("keeps Aurelia prompt evidence-before-certainty rules", () => {
    const prompt = read("lib/ai/identity-system-prompt.ts");
    expect(prompt).toContain("EVIDENCE BEFORE CERTAINTY");
    expect(prompt).toContain("embedded manager development intelligence partner");
    expect(prompt).toContain("You are a High D so");
    expect(prompt).toContain("The available evidence suggests");
  });

  it("wires Development Evidence UI and My Development separation", () => {
    expect(existsSync(join(root, "components/development-evidence/development-evidence-view.tsx"))).toBe(true);
    expect(read("components/my-development-view.tsx")).toContain(
      "kept separate from the people"
    );
    expect(read("components/home-app.tsx")).toContain("development-evidence");
    expect(read("components/person-intelligence-view.tsx")).toContain(
      "DevelopmentIntelligenceEvidencePanel"
    );
  });

  it("includes fictional Averly sample evidence without proprietary content", () => {
    const sample = read(
      "sample-data/averly-services-group/development-evidence.json"
    );
    expect(sample).toContain("sophie-bennett");
    expect(sample).toContain("marcus-reed");
    expect(sample).toContain("priya-desai");
    expect(sample).toContain("jonathan-clarke");
    expect(sample).toContain("aisha-rahman");
    expect(sample).toMatch(/[Ff]ictional/);
    expect(sample).not.toMatch(/Everything DiSC|official report form/i);
  });
});
