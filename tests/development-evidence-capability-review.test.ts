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
  buildObservationReviewDecisions,
  capabilityReviewDecisionOutcome,
  parseReviewCapabilityKey,
  reviewedCapabilityKeyFromDecision,
  UNEXPECTED_CAPABILITY_SELECTION_MESSAGE,
} from "@/lib/development-evidence/authorised-observations";
import {
  mapToPridmoraCapabilityKey,
  PRIDMORA_CAPABILITIES,
} from "@/lib/development-evidence/capabilities";
import { constrainStructuredEvidenceObservations } from "@/lib/development-evidence/constrain-observations";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("mapToPridmoraCapabilityKey", () => {
  it("maps human-readable names to canonical keys", () => {
    expect(mapToPridmoraCapabilityKey("accountability")).toBe("accountability");
    expect(mapToPridmoraCapabilityKey("Accountability")).toBe("accountability");
    expect(mapToPridmoraCapabilityKey("Feedback & Difficult Conversations")).toBe(
      "feedback_difficult_conversations"
    );
    expect(mapToPridmoraCapabilityKey("listening_presence")).toBe(
      "listening_presence"
    );
  });

  it("returns null for unknown or empty values rather than guessing", () => {
    expect(mapToPridmoraCapabilityKey("")).toBeNull();
    expect(mapToPridmoraCapabilityKey("not_a_real_capability")).toBeNull();
    expect(mapToPridmoraCapabilityKey("westbridge_special")).toBeNull();
    expect(mapToPridmoraCapabilityKey(42)).toBeNull();
  });
});

describe("parseReviewCapabilityKey", () => {
  it("accepts a valid catalogue key", () => {
    expect(parseReviewCapabilityKey("accountability")).toBe("accountability");
    expect(parseReviewCapabilityKey("feedback_difficult_conversations")).toBe(
      "feedback_difficult_conversations"
    );
  });

  it("maps an AI display name to the canonical key", () => {
    expect(parseReviewCapabilityKey("Delegation")).toBe("delegation");
    expect(parseReviewCapabilityKey("Strategic Thinking")).toBe(
      "strategic_thinking"
    );
  });

  it("clears capability with null or empty", () => {
    expect(parseReviewCapabilityKey(null)).toBeNull();
    expect(parseReviewCapabilityKey("")).toBeNull();
  });

  it("leaves an invalid AI capability key unassigned instead of rejecting review", () => {
    expect(parseReviewCapabilityKey("not_a_real_capability")).toBeNull();
    expect(parseReviewCapabilityKey("westbridge_special")).toBeNull();
  });

  it("uses a safe message for unexpected non-string values", () => {
    expect(() => parseReviewCapabilityKey(42)).toThrow(
      UNEXPECTED_CAPABILITY_SELECTION_MESSAGE
    );
    expect(UNEXPECTED_CAPABILITY_SELECTION_MESSAGE).not.toMatch(
      /Invalid capability key/i
    );
    expect(UNEXPECTED_CAPABILITY_SELECTION_MESSAGE).toMatch(
      /without a capability assigned/i
    );
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
  it("valid capability accepted", () => {
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

  it("invalid AI capability key is left unassigned and evidence can still be accepted", () => {
    const proposed = "not_a_real_capability";
    const reviewed = parseReviewCapabilityKey(proposed);
    expect(reviewed).toBeNull();
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
            reviewStatus: "approved",
            capabilityKey: reviewed,
          },
        ],
        true
      )
    ).toEqual([]);
  });

  it("no capability identified stays unassigned after accept", () => {
    const reviewed = parseReviewCapabilityKey(null);
    expect(reviewed).toBeNull();
    expect(
      capabilityReviewDecisionOutcome({
        proposedCapabilityKey: null,
        reviewedCapabilityKey: reviewed,
      })
    ).toBe("unchanged_absent");
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
    ).toEqual([]);
  });

  it("evidence accepted with no capability", () => {
    expect(
      authorisedCapabilityKeysFromObservations(
        [
          {
            includeInIntelligence: true,
            reviewStatus: "approved",
            capabilityKey: null,
          },
        ],
        true
      )
    ).toEqual([]);
  });

  it("changing an Aurelia capability to another valid capability", () => {
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

  it("clearing a proposed capability", () => {
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
    expect(route).not.toContain("Invalid capability key.");
    expect(repository).toContain("reviewedCapabilityKeyFromDecision");
    expect(repository).not.toContain("parseReviewCapabilityKey");
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

const kateObservation = {
  id: "obs-kate-1",
  title: "Follows through after handover",
  description: "Keeps commitments visible to the team.",
};

/**
 * Kate's deployed Accept path: loadDetail stored the raw Aurelia display name
 * in editMap, and Approve posted that string without mapping.
 * Failing value observed: "Accountability" (catalogue label, not key).
 */
function kateHeadAcceptPayload(persistedCapabilityKey: string | null) {
  return buildObservationReviewDecisions({
    observations: [
      {
        ...kateObservation,
        capabilityKey: persistedCapabilityKey,
      },
    ],
    editMap: {
      "obs-kate-1": {
        title: kateObservation.title,
        description: kateObservation.description,
        include: true,
        capabilityKey: persistedCapabilityKey,
      },
    },
    decision: "approve",
  });
}

function acceptPostedCapability(decision: {
  observationId: string;
  capabilityKey?: string | null;
}) {
  const posted = JSON.parse(JSON.stringify({ observationDecisions: [decision] }));
  return reviewedCapabilityKeyFromDecision({
    decision: posted.observationDecisions[0],
    existingCapabilityKey: "Accountability",
  });
}

describe("Kate Accept evidence path — persisted display name", () => {
  it("canonicalises the exact failing value instead of throwing Invalid capability key", () => {
    const failingValue = "Accountability";
    const uiDecisions = kateHeadAcceptPayload(failingValue);
    expect(uiDecisions[0]?.capabilityKey).toBe("accountability");

    const postedBody = JSON.parse(
      JSON.stringify({
        decision: "approve",
        includeInIntelligence: true,
        observationDecisions: uiDecisions,
      })
    ) as {
      observationDecisions: Array<{ capabilityKey?: string | null }>;
    };

    expect(() =>
      reviewedCapabilityKeyFromDecision({
        decision: postedBody.observationDecisions[0]!,
        existingCapabilityKey: failingValue,
      })
    ).not.toThrow(/Invalid capability key/i);

    expect(
      reviewedCapabilityKeyFromDecision({
        decision: postedBody.observationDecisions[0]!,
        existingCapabilityKey: failingValue,
      })
    ).toBe("accountability");
  });

  it("accepts a deployed-client payload that still posts the raw persisted display name", () => {
    const failingValue = "Accountability";
    const deployedClientBody = JSON.parse(
      JSON.stringify({
        observationDecisions: [
          {
            observationId: "obs-kate-1",
            reviewStatus: "approved",
            capabilityKey: failingValue,
            includeInIntelligence: true,
          },
        ],
      })
    ) as { observationDecisions: Array<{ capabilityKey?: string | null }> };

    expect(
      reviewedCapabilityKeyFromDecision({
        decision: deployedClientBody.observationDecisions[0]!,
        existingCapabilityKey: failingValue,
      })
    ).toBe("accountability");
    expect(() =>
      parseReviewCapabilityKey(deployedClientBody.observationDecisions[0]!.capabilityKey)
    ).not.toThrow();
  });

  it("valid canonical capability key → accept", () => {
    expect(acceptPostedCapability({ observationId: "obs-1", capabilityKey: "delegation" })).toBe(
      "delegation"
    );
  });

  it("valid display name → canonicalise → accept", () => {
    expect(
      acceptPostedCapability({
        observationId: "obs-1",
        capabilityKey: "Feedback & Difficult Conversations",
      })
    ).toBe("feedback_difficult_conversations");
  });

  it("unknown AI value → unassigned → accept", () => {
    expect(
      acceptPostedCapability({
        observationId: "obs-1",
        capabilityKey: "westbridge_special",
      })
    ).toBeNull();
  });

  it("no capability → accept", () => {
    expect(
      kateHeadAcceptPayload(null)[0]?.capabilityKey
    ).toBeNull();
    expect(
      reviewedCapabilityKeyFromDecision({
        decision: { capabilityKey: null },
        existingCapabilityKey: null,
      })
    ).toBeNull();
  });

  it("manager changes to another valid capability → accept", () => {
    const decisions = buildObservationReviewDecisions({
      observations: [
        {
          ...kateObservation,
          capabilityKey: "Accountability",
        },
      ],
      editMap: {
        "obs-kate-1": {
          title: kateObservation.title,
          description: kateObservation.description,
          include: true,
          capabilityKey: "delegation",
        },
      },
      decision: "approve",
    });
    expect(decisions[0]?.capabilityKey).toBe("delegation");
    expect(
      reviewedCapabilityKeyFromDecision({
        decision: decisions[0]!,
        existingCapabilityKey: "Accountability",
      })
    ).toBe("delegation");
  });

  it("manager clears capability → accept", () => {
    const decisions = buildObservationReviewDecisions({
      observations: [
        {
          ...kateObservation,
          capabilityKey: "accountability",
        },
      ],
      editMap: {
        "obs-kate-1": {
          title: kateObservation.title,
          description: kateObservation.description,
          include: true,
          capabilityKey: null,
        },
      },
      decision: "approve",
    });
    expect(decisions[0]?.capabilityKey).toBeNull();
    expect(
      reviewedCapabilityKeyFromDecision({
        decision: decisions[0]!,
        existingCapabilityKey: "accountability",
      })
    ).toBeNull();
  });
});

describe("review UI capability control", () => {
  it("exposes catalogue labels for capability selection without a management console", () => {
    const view = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    expect(view).toContain("PRIDMORA_CAPABILITIES");
    expect(view).toContain("buildObservationReviewDecisions");
    expect(view).toContain("capabilityKeyForReviewSubmission");
    expect(view).toContain("capabilityKey");
    expect(view).toContain("No capability confidently identified");
    expect(view).toContain(
      "Aurelia could not identify a capability that this evidence clearly supports."
    );
    expect(view).toContain(
      "change it to another capability this evidence supports"
    );
    expect(view).not.toContain("catalogue capability");
    expect(view).not.toMatch(/Aurelia found no capability/i);
    expect(view).toContain("{capability.label}");
    expect(view).toContain("evidence-review-capability-");
    expect(PRIDMORA_CAPABILITIES.length).toBeGreaterThan(5);
  });
});

describe("analyse persistence maps Aurelia capability names", () => {
  it("maps a display name to a catalogue key and leaves unknown values unassigned", () => {
    const constrained = constrainStructuredEvidenceObservations(
      {
        observations: [
          {
            title: "Owns the follow-through",
            description: "Keeps commitments after handover.",
            capabilityKey: "Accountability",
          },
          {
            title: "Unmapped signal",
            description: "A useful observation without a catalogue match.",
            capabilityKey: "not_a_real_capability",
          },
          {
            title: "No capability named",
            description: "Observation stands without a capability.",
          },
        ],
      },
      "manager_observation"
    );
    expect(constrained.observations?.[0]?.capabilityKey).toBe("accountability");
    expect(constrained.observations?.[1]?.capabilityKey).toBeUndefined();
    expect(constrained.observations?.[2]?.capabilityKey).toBeUndefined();
  });

  it("asks Aurelia for catalogue keys only", () => {
    const source = read("lib/development-evidence/ai-context.ts");
    expect(source).toContain(
      "If capabilityKey is set, it must be exactly one of:"
    );
    expect(source).toContain("Do not use display names.");
    expect(source).toContain("PRIDMORA_CAPABILITIES");
  });
});
