/**
 * Capability classification review — Manager can accept, correct, or clear
 * Aurelia-proposed capability keys; evidence.capability_keys follow authorised
 * observation state after review.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  authorisedCapabilityKeysFromObservations,
  capabilityReviewDecisionOutcome,
  parseReviewCapabilityKey,
} from "@/lib/development-evidence/authorised-observations";
import { PRIDMORA_CAPABILITIES } from "@/lib/development-evidence/capabilities";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("parseReviewCapabilityKey", () => {
  it("accepts valid catalogue keys", () => {
    expect(parseReviewCapabilityKey("accountability")).toBe("accountability");
    expect(parseReviewCapabilityKey("feedback_difficult_conversations")).toBe(
      "feedback_difficult_conversations"
    );
  });

  it("clears capability with null or empty", () => {
    expect(parseReviewCapabilityKey(null)).toBeNull();
    expect(parseReviewCapabilityKey("")).toBeNull();
  });

  it("rejects arbitrary/invalid capability keys", () => {
    expect(() => parseReviewCapabilityKey("not_a_real_capability")).toThrow(
      /Invalid capability key/
    );
    expect(() => parseReviewCapabilityKey("westbridge_special")).toThrow(
      /Invalid capability key/
    );
    expect(() => parseReviewCapabilityKey(42)).toThrow(/Invalid capability key/);
  });
});

describe("capabilityReviewDecisionOutcome", () => {
  it("distinguishes accepted from corrected and removed", () => {
    expect(
      capabilityReviewDecisionOutcome({
        proposedCapabilityKey: "delegation",
        reviewedCapabilityKey: "delegation",
      })
    ).toBe("accepted");
    expect(
      capabilityReviewDecisionOutcome({
        proposedCapabilityKey: "delegation",
        reviewedCapabilityKey: "accountability",
      })
    ).toBe("corrected");
    expect(
      capabilityReviewDecisionOutcome({
        proposedCapabilityKey: "delegation",
        reviewedCapabilityKey: null,
      })
    ).toBe("removed");
  });
});

describe("authorisedCapabilityKeysFromObservations", () => {
  it("derives evidence capability_keys from included reviewed observations", () => {
    const keys = authorisedCapabilityKeysFromObservations(
      [
        {
          includeInIntelligence: true,
          reviewStatus: "approved",
          capabilityKey: "accountability",
        },
        {
          includeInIntelligence: true,
          reviewStatus: "edited",
          capabilityKey: "ownership",
        },
      ],
      true
    );
    expect(keys).toEqual(["accountability", "ownership"]);
  });

  it("excludes rejected/excluded observations from capability keys", () => {
    const keys = authorisedCapabilityKeysFromObservations(
      [
        {
          includeInIntelligence: false,
          reviewStatus: "excluded",
          capabilityKey: "accountability",
        },
        {
          includeInIntelligence: false,
          reviewStatus: "rejected",
          capabilityKey: "delegation",
        },
        {
          includeInIntelligence: true,
          reviewStatus: "approved",
          capabilityKey: "communication",
        },
      ],
      true
    );
    expect(keys).toEqual(["communication"]);
  });

  it("returns no capability keys when evidence is not included in intelligence", () => {
    const keys = authorisedCapabilityKeysFromObservations(
      [
        {
          includeInIntelligence: true,
          reviewStatus: "approved",
          capabilityKey: "accountability",
        },
      ],
      false
    );
    expect(keys).toEqual([]);
  });

  it("ignores non-catalogue capability values on observations", () => {
    const keys = authorisedCapabilityKeysFromObservations(
      [
        {
          includeInIntelligence: true,
          reviewStatus: "approved",
          capabilityKey: "not_real",
        },
        {
          includeInIntelligence: true,
          reviewStatus: "approved",
          capabilityKey: null,
        },
      ],
      true
    );
    expect(keys).toEqual([]);
  });
});

describe("review decision → authorised capability_keys examples", () => {
  it("accepts Aurelia proposal unchanged", () => {
    const proposed = "delegation";
    const reviewed = parseReviewCapabilityKey(proposed);
    expect(
      capabilityReviewDecisionOutcome({
        proposedCapabilityKey: proposed,
        reviewedCapabilityKey: reviewed,
      })
    ).toBe("accepted");
    expect(
      authorisedCapabilityKeysFromObservations(
        [
          {
            includeInIntelligence: true,
            reviewStatus: "approved",
            capabilityKey: reviewed,
          },
        ],
        true
      )
    ).toEqual(["delegation"]);
  });

  it("corrects to another catalogue capability", () => {
    const proposed = "delegation";
    const reviewed = parseReviewCapabilityKey("accountability");
    expect(
      capabilityReviewDecisionOutcome({
        proposedCapabilityKey: proposed,
        reviewedCapabilityKey: reviewed,
      })
    ).toBe("corrected");
    expect(
      authorisedCapabilityKeysFromObservations(
        [
          {
            includeInIntelligence: true,
            reviewStatus: "edited",
            capabilityKey: reviewed,
          },
        ],
        true
      )
    ).toEqual(["accountability"]);
  });

  it("removes proposed capability", () => {
    const proposed = "delegation";
    const reviewed = parseReviewCapabilityKey(null);
    expect(
      capabilityReviewDecisionOutcome({
        proposedCapabilityKey: proposed,
        reviewedCapabilityKey: reviewed,
      })
    ).toBe("removed");
    expect(
      authorisedCapabilityKeysFromObservations(
        [
          {
            includeInIntelligence: true,
            reviewStatus: "edited",
            capabilityKey: reviewed,
          },
        ],
        true
      )
    ).toEqual([]);
  });
});

describe("review API and repository capability review support", () => {
  it("wires capabilityKey through review API into reviewEvidence", () => {
    const route = read(
      "app/api/development-evidence/item/[evidenceId]/review/route.ts"
    );
    const repository = read("lib/development-evidence/repository.ts");
    expect(route).toContain("capabilityKey?: string | null");
    expect(route).toContain("requireAssignedPersonInOrganisation");
    expect(repository).toContain("parseReviewCapabilityKey");
    expect(repository).toContain("authorisedCapabilityKeysFromObservations");
    expect(repository).toContain("capabilityDecisions");
    expect(repository).toContain("proposedCapabilityKeys");
    expect(repository).toMatch(/capability_keys:\s*authorisedCapabilityKeys/);
  });

  it("records AI proposal separately from Manager capability decisions in audit", () => {
    const repository = read("lib/development-evidence/repository.ts");
    expect(repository).toContain('action: "evidence_processed"');
    expect(repository).toContain("proposedCapabilityKeys:");
    expect(repository).toContain('action: "evidence_reviewed"');
    expect(repository).toContain("capabilityDecisions");
    expect(repository).toContain("capabilityReviewDecisionOutcome");
  });

  it("keeps assignment gate so another Manager or Lead cannot review via this route alone", () => {
    const route = read(
      "app/api/development-evidence/item/[evidenceId]/review/route.ts"
    );
    const gate = read("lib/organisations/person-access-gate.ts");
    expect(route).toContain("requireAssignedPersonInOrganisation");
    expect(route).toContain("detail.evidence.clientId");
    expect(gate).toContain("requireAssignedClientAccess");
    expect(route).not.toMatch(
      /canReadOrganisationIntelligence|professionalRole.*lead/i
    );
  });

  it("MDI still requires include_in_intelligence and does not change threshold", () => {
    const load = read("lib/manager-development-intelligence/load-signals.ts");
    const constants = read(
      "lib/manager-development-intelligence/constants.ts"
    );
    expect(load).toMatch(/\.eq\(\s*"include_in_intelligence"\s*,\s*true\s*\)/);
    expect(constants).toContain("MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD = 5");
  });
});

describe("review UI capability control", () => {
  it("exposes catalogue labels for capability selection without a management console", () => {
    const view = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    expect(view).toContain("PRIDMORA_CAPABILITIES");
    expect(view).toContain("capabilityKey");
    expect(view).toContain("No capability");
    expect(view).toContain("{capability.label}");
    expect(view).toContain("evidence-review-capability-");
    expect(PRIDMORA_CAPABILITIES.length).toBeGreaterThan(5);
  });
});
