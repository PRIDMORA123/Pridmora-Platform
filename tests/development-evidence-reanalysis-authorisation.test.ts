/**
 * Forced re-analysis must invalidate prior intelligence authorisation.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("beginEvidenceAnalysisRun / force re-analysis authorisation", () => {
  it("withdraws include_in_intelligence and returns pending_review when analysis begins", () => {
    const repository = read("lib/development-evidence/repository.ts");
    expect(repository).toContain("export async function beginEvidenceAnalysisRun");
    expect(repository).toContain('reason: "reanalysis_started"');
    expect(repository).toContain('processing_status: "analysing"');
    expect(repository).toContain("include_in_intelligence: false");
    expect(repository).toContain('review_status: "pending_review"');
    expect(repository).toContain("capability_keys: []");
    expect(repository).toContain('action: "evidence_excluded"');
  });

  it("analyse path calls beginEvidenceAnalysisRun before model work", () => {
    const analyse = read("lib/development-evidence/analyse.ts");
    expect(analyse).toContain("beginEvidenceAnalysisRun");
    const beginAt = analyse.indexOf("beginEvidenceAnalysisRun");
    const openaiLoopAt = analyse.indexOf("EVIDENCE_ANALYSIS_MAX_ATTEMPTS");
    expect(beginAt).toBeGreaterThan(-1);
    expect(openaiLoopAt).toBeGreaterThan(beginAt);
  });

  it("failed analysis remains excluded from intelligence", () => {
    const repository = read("lib/development-evidence/repository.ts");
    const failedBlock = repository.slice(
      repository.indexOf("export async function markEvidenceAnalysisFailed"),
      repository.indexOf("export async function beginEvidenceAnalysisRun")
    );
    expect(failedBlock).toContain('processing_status: "failed"');
    expect(failedBlock).toContain("include_in_intelligence: false");
    expect(failedBlock).toContain('review_status: "pending_review"');
    expect(failedBlock).toContain('reason: "reanalysis_failed"');
  });

  it("successful saveAnalysedEvidence stays excluded pending fresh review", () => {
    const repository = read("lib/development-evidence/repository.ts");
    const saveBlock = repository.slice(
      repository.indexOf("export async function saveAnalysedEvidence"),
      repository.indexOf("export async function reviewEvidence")
    );
    expect(saveBlock).toContain('review_status: "pending_review"');
    expect(saveBlock).toContain("include_in_intelligence: false");
    expect(saveBlock).not.toMatch(/include_in_intelligence:\s*true/);
  });

  it("fresh review can re-authorise via reviewEvidence", () => {
    const repository = read("lib/development-evidence/repository.ts");
    expect(repository).toContain("export async function reviewEvidence");
    expect(repository).toMatch(/include_in_intelligence:\s*include/);
  });

  it("audit preserves prior authorisation and records invalidation separately", () => {
    const repository = read("lib/development-evidence/repository.ts");
    expect(repository).toContain("previousReviewStatus");
    expect(repository).toContain("previousIncludeInIntelligence");
    expect(repository).toContain("previousCapabilityKeys");
    expect(repository).toContain('reason: "reanalysis_started"');
    // Historical rows are inserts only — never deleted on reanalysis.
    expect(repository).not.toMatch(
      /development_evidence_audit_log[\s\S]{0,80}\.delete\(/
    );
  });

  it("MDI cannot consume failed or non-ready evidence even if once approved", () => {
    const load = read("lib/manager-development-intelligence/load-signals.ts");
    expect(load).toMatch(/\.eq\(\s*"include_in_intelligence"\s*,\s*true\s*\)/);
    expect(load).toMatch(/\.eq\(\s*"processing_status"\s*,\s*"ready"\s*\)/);
    expect(load).toMatch(
      /\.in\(\s*"review_status"\s*,\s*\["approved",\s*"edited",\s*"internal_reference"\]\s*\)/
    );
  });

  it("non-force reuse of ready analysis is unchanged (still short-circuits)", () => {
    const analyse = read("lib/development-evidence/analyse.ts");
    expect(analyse).toContain("!input.force");
    expect(analyse).toContain("reusedExistingAnalysis: true");
    expect(analyse).toContain("hasUsableAnalysisObservations");
  });
});

describe("lifecycle semantics helpers", () => {
  it("documents invalidation before analysing for force and non-force overwrite paths", () => {
    const analyse = read("lib/development-evidence/analyse.ts");
    // beginEvidenceAnalysisRun is called for any path that reaches model/deterministic analysis
    expect(analyse).toMatch(
      /beginEvidenceAnalysisRun\(\{[\s\S]*?force:\s*Boolean\(input\.force\)/
    );
  });
});
