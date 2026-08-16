import { describe, expect, it } from "vitest";
import {
  buildWhyThisPayload,
  filterAuthorisedObservations,
  MAX_VERIFIED_SOURCE_EXCERPT_CHARS,
  normalizeEvidenceText,
  observationContributesToIntelligence,
  pruneStructuredEvidenceToAuthorisedObservations,
  resolveVerifiedSourceExcerpt,
  type DevelopmentEvidenceObservation,
  type DevelopmentEvidenceRecord,
} from "@/lib/development-evidence";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function makeObservation(
  overrides: Partial<DevelopmentEvidenceObservation> & { id: string }
): DevelopmentEvidenceObservation {
  return {
    id: overrides.id,
    evidenceId: "ev-1",
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
    includeInIntelligence: overrides.includeInIntelligence ?? false,
    reviewStatus: overrides.reviewStatus ?? "proposed",
    sortOrder: 0,
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
  };
}

function makeRecord(
  overrides: Partial<DevelopmentEvidenceRecord> = {}
): DevelopmentEvidenceRecord {
  return {
    id: "ev-1",
    organisationId: "org-1",
    clientId: "client-1",
    evidenceType: "stakeholder_feedback",
    sourceType: "uploaded_document",
    sourceRecordId: null,
    title: "Alex feedback.docx",
    evidenceDate: "2026-08-01",
    capturedAt: "2026-08-16T12:00:00.000Z",
    capturedBy: "user-1",
    originalDocumentId: "doc-1",
    processingStatus: "ready",
    reviewStatus: overrides.reviewStatus ?? "approved",
    includeInIntelligence: overrides.includeInIntelligence ?? true,
    structuredEvidence: overrides.structuredEvidence ?? {
      observations: [
        {
          title: "Excluded leak",
          description: "Should not appear after exclusion",
          behaviouralEvidence: "LEAKED PARAPHRASE NOT IN SOURCE",
        },
        {
          title: "Included signal",
          description: "Should appear",
          behaviouralEvidence: "raise delivery concerns early",
        },
      ],
    },
    sourceSummary: "Reviewed stakeholder feedback",
    freshnessClass: "current",
    restricted: false,
    contentHash: "hash",
    extractionVersion: "v1",
    purpose: "feedback",
    sourceLabel: "Uploaded document",
    capabilityKeys: ["communication"],
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("verified source excerpts", () => {
  const extracted =
    "Alex has shown a greater readiness to raise delivery concerns early with the team rather than waiting for senior intervention. " +
    "There is also an opportunity to strengthen impact by recommending practical solutions alongside those concerns.";

  it("returns an exact behaviouralEvidence match as a verified source excerpt", () => {
    const behavioural =
      "Alex has shown a greater readiness to raise delivery concerns early with the team rather than waiting for senior intervention.";
    const result = resolveVerifiedSourceExcerpt({
      extractedText: extracted,
      behaviouralEvidence: behavioural,
      observationTitle: "Increased willingness to raise delivery concerns early",
      observationDescription: "Meaning paraphrase",
    });
    expect(result.matchKind).toBe("exact_behavioural");
    expect(result.excerpt).toBe(behavioural);
    expect(extracted.includes(result.excerpt!)).toBe(true);
  });

  it("derives an excerpt from extracted_text when behaviouralEvidence is a paraphrase", () => {
    const result = resolveVerifiedSourceExcerpt({
      extractedText: extracted,
      behaviouralEvidence:
        "Alex now speaks up sooner about delivery risks instead of escalating late.",
      observationTitle: "Increased willingness to raise delivery concerns early",
      observationDescription:
        "Alex has shown greater readiness to raise delivery concerns proactively.",
    });
    expect(result.matchKind).toBe("derived");
    expect(result.excerpt).toBeTruthy();
    expect(extracted.includes(result.excerpt!)).toBe(true);
    expect(result.excerpt).not.toContain("escalating late");
  });

  it("returns no invented excerpt when no safe match exists", () => {
    const result = resolveVerifiedSourceExcerpt({
      extractedText:
        "Routine project status notes with no developmental behavioural detail present.",
      behaviouralEvidence: "Completely unrelated invented claim about promotion readiness.",
      observationTitle: "Unrelated theme",
      observationDescription: "No overlap with the source document content.",
    });
    expect(result.matchKind).toBe("none");
    expect(result.excerpt).toBeNull();
  });

  it("bounds excerpts and never equals the full oversized extracted document", () => {
    const longSource = `${extracted} `.repeat(20).trim();
    const result = resolveVerifiedSourceExcerpt({
      extractedText: longSource,
      behaviouralEvidence: extracted.slice(0, 120),
      observationTitle: "Raise delivery concerns",
      observationDescription: "raise delivery concerns early",
    });
    expect(result.excerpt).toBeTruthy();
    expect(result.excerpt!.length).toBeLessThanOrEqual(
      MAX_VERIFIED_SOURCE_EXCERPT_CHARS
    );
    expect(result.excerpt!.length).toBeLessThan(longSource.length);
    expect(longSource.includes(result.excerpt!)).toBe(true);
  });

  it("item API route omits full extracted text from the client payload", () => {
    const route = readFileSync(
      join(root, "app/api/development-evidence/item/[evidenceId]/route.ts"),
      "utf8"
    );
    expect(route).toContain("observationSourceEvidence");
    expect(route).toContain("resolveVerifiedSourceExcerpt");
    expect(route).toContain("hasExtractedText");
    expect(route).toContain(
      "// Never return full extracted text to list UIs by default."
    );
    const documentPayloadStart = route.indexOf("document: detail.document");
    expect(documentPayloadStart).toBeGreaterThan(-1);
    const documentPayload = route.slice(
      documentPayloadStart,
      documentPayloadStart + 450
    );
    expect(documentPayload).toContain("hasExtractedText");
    expect(documentPayload).not.toContain("extractedText:");
  });
});

describe("authorised observation exclusion boundary", () => {
  it("treats pending/rejected/excluded observations as non-contributing", () => {
    expect(
      observationContributesToIntelligence(
        makeObservation({
          id: "o1",
          includeInIntelligence: false,
          reviewStatus: "proposed",
        })
      )
    ).toBe(false);
    expect(
      observationContributesToIntelligence(
        makeObservation({
          id: "o2",
          includeInIntelligence: false,
          reviewStatus: "rejected",
        })
      )
    ).toBe(false);
    expect(
      observationContributesToIntelligence(
        makeObservation({
          id: "o3",
          includeInIntelligence: false,
          reviewStatus: "excluded",
        })
      )
    ).toBe(false);
    expect(
      observationContributesToIntelligence(
        makeObservation({
          id: "o4",
          includeInIntelligence: true,
          reviewStatus: "approved",
        })
      )
    ).toBe(true);
  });

  it("why-this uses only authorised observation rows, not stale structured_evidence", () => {
    const record = makeRecord({
      includeInIntelligence: true,
      reviewStatus: "approved",
      structuredEvidence: {
        observations: [
          {
            title: "Excluded leak",
            description: "Should not appear",
            behaviouralEvidence: "LEAKED PARAPHRASE NOT IN SOURCE",
            developmentImplication: "Leaked implication",
          },
        ],
      },
    });

    const included = makeObservation({
      id: "inc",
      title: "Included signal",
      behaviouralEvidence: "raise delivery concerns early",
      developmentImplication: "Keep inviting early delivery concerns.",
      includeInIntelligence: true,
      reviewStatus: "approved",
    });
    const excluded = makeObservation({
      id: "exc",
      title: "Excluded leak",
      behaviouralEvidence: "LEAKED PARAPHRASE NOT IN SOURCE",
      developmentImplication: "Leaked implication",
      includeInIntelligence: false,
      reviewStatus: "excluded",
    });

    const why = buildWhyThisPayload({
      insight: "Delivery concerns",
      records: [record],
      observations: [included, excluded],
    });

    expect(why.observedBehaviours).toEqual(["raise delivery concerns early"]);
    expect(why.observedBehaviours.join(" ")).not.toContain("LEAKED");
    expect(why.developmentImplication).toBe(
      "Keep inviting early delivery concerns."
    );
  });

  it("mixed approval prunes structured_evidence to included observations only", () => {
    const included = makeObservation({
      id: "inc",
      title: "Included signal",
      description: "Keep this",
      behaviouralEvidence: "raise delivery concerns early",
      includeInIntelligence: true,
      reviewStatus: "approved",
    });
    const excluded = makeObservation({
      id: "exc",
      title: "Excluded leak",
      description: "Drop this",
      behaviouralEvidence: "LEAKED PARAPHRASE NOT IN SOURCE",
      includeInIntelligence: false,
      reviewStatus: "excluded",
    });

    const pruned = pruneStructuredEvidenceToAuthorisedObservations({
      structured: {
        observations: [
          {
            title: "Excluded leak",
            description: "Drop this",
            behaviouralEvidence: "LEAKED PARAPHRASE NOT IN SOURCE",
          },
          {
            title: "Included signal",
            description: "Keep this",
            behaviouralEvidence: "raise delivery concerns early",
          },
        ],
        strengthSignals: ["Keep strength"],
      },
      observations: [included, excluded],
      includeEvidenceInIntelligence: true,
    });

    expect(pruned.observations).toHaveLength(1);
    expect(pruned.observations?.[0]?.title).toBe("Included signal");
    expect(pruned.strengthSignals).toEqual(["Keep strength"]);
  });

  it("rejected evidence clears structured observations from the pruned blob", () => {
    const pruned = pruneStructuredEvidenceToAuthorisedObservations({
      structured: {
        observations: [
          {
            title: "Any",
            description: "Should clear",
            behaviouralEvidence: "text",
          },
        ],
      },
      observations: [
        makeObservation({
          id: "o1",
          includeInIntelligence: false,
          reviewStatus: "rejected",
        }),
      ],
      includeEvidenceInIntelligence: false,
    });
    expect(pruned.observations).toEqual([]);
  });

  it("filterAuthorisedObservations drops unchecked exclusions", () => {
    const rows = filterAuthorisedObservations([
      makeObservation({
        id: "a",
        includeInIntelligence: true,
        reviewStatus: "edited",
      }),
      makeObservation({
        id: "b",
        includeInIntelligence: false,
        reviewStatus: "excluded",
      }),
    ]);
    expect(rows.map(item => item.id)).toEqual(["a"]);
  });

  it("normalizeEvidenceText collapses whitespace for match comparison", () => {
    expect(normalizeEvidenceText("  a   b\n c ")).toBe("a b c");
  });
});
