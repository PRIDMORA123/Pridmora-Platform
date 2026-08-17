import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SENSITIVE_INFO_AURELIA_ENTRY_COPY,
  SENSITIVE_INFO_AURELIA_PROMPT_GUIDANCE,
  SENSITIVE_INFO_EVIDENCE_PURPOSE_COPY,
  SENSITIVE_INFO_EVIDENCE_PURPOSE_STEP_COPY,
  SENSITIVE_INFO_EVIDENCE_UPLOAD_COPY,
  SENSITIVE_INFO_PREPARATION_NOTES_HELPER,
} from "@/lib/organisations/sensitive-information-guidance";
import { EVIDENCE_APPROVAL_ORG_VISIBILITY_COPY } from "@/lib/organisations/manager-privacy-visibility-copy";
import { PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE } from "@/lib/ai/people-policy-handoff";
import { MANAGER_AURELIA_CONVERSATION_ADDENDUM } from "@/lib/ai/manager-aurelia-conversation";
import { DEVELOPMENT_EVIDENCE_STORAGE_BUCKET } from "@/lib/development-evidence/storage-path";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("FIX-5 sensitive-information recording / upload guardrail", () => {
  it("1–2: Talk/Aurelia has one entry-point data-minimisation note, not per message", () => {
    const view = read("components/aurelia/manager-aurelia-view.tsx");
    expect(view).toContain("SENSITIVE_INFO_AURELIA_ENTRY_COPY");
    expect(view).toContain("manager-aurelia-data-minimisation");
    expect(SENSITIVE_INFO_AURELIA_ENTRY_COPY).toMatch(
      /Avoid unnecessary identifying or sensitive details/i
    );
    expect(SENSITIVE_INFO_AURELIA_ENTRY_COPY).not.toMatch(
      /Never enter personal information/i
    );
    // Shown in header once — not mapped over turns.
    expect(view).toMatch(
      /manager-aurelia__minimisation[\s\S]*turns\.map/
    );
    expect(view).not.toMatch(
      /turns\.map[\s\S]{0,200}SENSITIVE_INFO_AURELIA_ENTRY_COPY/
    );
  });

  it("3: Preparation guides free-text without blocking", () => {
    const form = read("components/prepare/preparation-form.tsx");
    expect(form).toContain("SENSITIVE_INFO_PREPARATION_NOTES_HELPER");
    expect(SENSITIVE_INFO_PREPARATION_NOTES_HELPER).toMatch(
      /not for HR case notes/i
    );
    expect(form).toContain("updateField(\"privateNotes\"");
    expect(form).not.toContain("blocked");
  });

  it("4–5: Evidence upload warns; purpose is developmental not case repository", () => {
    const evidence = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    expect(evidence).toContain("SENSITIVE_INFO_EVIDENCE_UPLOAD_COPY");
    expect(evidence).toContain("evidence-upload-data-minimisation");
    expect(evidence).toContain("SENSITIVE_INFO_EVIDENCE_PURPOSE_COPY");
    expect(SENSITIVE_INFO_EVIDENCE_UPLOAD_COPY).toMatch(
      /unnecessary identifying or sensitive information/i
    );
    expect(SENSITIVE_INFO_EVIDENCE_PURPOSE_COPY).toMatch(
      /not an employee case file/i
    );
    expect(SENSITIVE_INFO_EVIDENCE_PURPOSE_STEP_COPY).toMatch(
      /development evidence for your record/i
    );
  });

  it("6–7: FIX-1 evidence authorisation and FIX-4 handoff remain intact", () => {
    const evidence = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    expect(evidence).toContain("EVIDENCE_APPROVAL_ORG_VISIBILITY_COPY");
    expect(EVIDENCE_APPROVAL_ORG_VISIBILITY_COPY).toMatch(
      /Development Intelligence/i
    );
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "Ordinary management work does NOT need a People/HR handoff"
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /not refusing to help/i
    );
  });

  it("8–12: no DLP, inspection, redaction, classifier, or blocked upload", () => {
    const guidance = read(
      "lib/organisations/sensitive-information-guidance.ts"
    );
    const evidence = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    expect(guidance).toMatch(/not legal policy, DLP, or a classifier/i);
    expect(guidance).not.toMatch(/scanFile|inspectFileContents|autoRedact/i);
    expect(evidence).not.toMatch(
      /scanFile|inspectContent|autoRedact|rejectFile/i
    );
    expect(evidence).toContain("uploadAndAnalyse");
    expect(SENSITIVE_INFO_AURELIA_PROMPT_GUIDANCE).toMatch(
      /do not lecture every turn/i
    );
    expect(DEVELOPMENT_EVIDENCE_STORAGE_BUCKET).toBe("development-evidence");
  });

  it("13–14: sector-neutral wording; no Vault/storage/intelligence logic changes", () => {
    const bundle = [
      SENSITIVE_INFO_AURELIA_ENTRY_COPY,
      SENSITIVE_INFO_PREPARATION_NOTES_HELPER,
      SENSITIVE_INFO_EVIDENCE_UPLOAD_COPY,
      SENSITIVE_INFO_EVIDENCE_PURPOSE_COPY,
    ].join("\n");
    expect(bundle).toMatch(/organisation/i);
    expect(bundle).not.toMatch(
      /NHS|Freedom to Speak Up|Trust policy|clinical governance/i
    );
    expect(bundle).not.toMatch(/Never enter personal information/i);
    expect(
      read("lib/organisations/sensitive-information-guidance.ts")
    ).not.toContain("client_private_identities");
    expect(
      read("lib/organisations/sensitive-information-guidance.ts")
    ).not.toContain("ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD");
  });
});
