import { describe, expect, it } from "vitest";
import { composeDevelopmentHeadlineIntelligence } from "@/lib/development-evidence/compose-headline-intelligence";
import type { DevelopmentIntelligenceEvidenceView } from "@/lib/development-evidence/types";
import { buildDevelopmentProfileViewModel } from "@/lib/development-profile-view-model";
import {
  filterSemanticDuplicates,
  isStrongDuplicate,
} from "@/lib/intelligence/semantic-overlap";
import type { DevelopmentProfile } from "@/lib/development-updates/types";
import type { Client } from "@/lib/types";

function emptyEvidenceView(): DevelopmentIntelligenceEvidenceView {
  return {
    currentPosition: "",
    developmentTrajectory: "",
    capabilities: [],
    strengthsBeingDemonstrated: [],
    developmentPriorities: [],
    evidenceConfidence: {
      level: "limited",
      label: "Limited",
      rationale: "",
      contributingFactors: [],
    },
    evidenceCoverage: {
      level: "limited",
      label: "Limited",
      representedLabels: [],
      notRepresentedLabels: [],
      typeCounts: {},
    },
    recentEvidence: [],
    missingOrConflicting: [],
    nextDevelopmentFocus: "",
    graph: { nodes: [], edges: [] },
  } as unknown as DevelopmentIntelligenceEvidenceView;
}

describe("semantic priority overlap", () => {
  it("detects paraphrased priority overlap", () => {
    expect(
      isStrongDuplicate(
        "Strengthen delegation under pressure",
        "Continue exploring: Strengthen Alex's confidence in delegation under pressure"
      )
    ).toBe(true);
  });

  it("filters growth areas that overlap current focus in lookingAhead", () => {
    const profile = {
      id: "p1",
      clientId: "c1",
      coachId: "coach",
      currentFocus: "Practise holding the agreed delegation boundary",
      strengths: [],
      values: [],
      motivators: [],
      emergingThemes: [],
      growthAreas: [
        {
          id: "g1",
          value: "Holding the agreed delegation boundary in live work",
          status: "supported",
        },
        {
          id: "g2",
          value: "Earlier escalation conversations",
          status: "emerging",
        },
      ],
      coachingPreferences: [],
      beliefs: [],
      patterns: [],
      commitments: [],
      coachingPatterns: [],
      patternsEvidenceFingerprint: null,
      patternsGeneratedAt: null,
      createdAt: "",
      updatedAt: "",
    } as DevelopmentProfile;

    const viewModel = buildDevelopmentProfileViewModel(
      {
        id: "c1",
        name: "Alex",
        sessions: [],
        actions: [],
      } as unknown as Client,
      profile
    );

    expect(viewModel.lookingAhead[0]).toMatch(/Continue exploring:/i);
    expect(
      viewModel.lookingAhead.some(item =>
        /Earlier escalation conversations/i.test(item)
      )
    ).toBe(true);
    expect(
      viewModel.lookingAhead.some(item =>
        /Holding the agreed delegation boundary in live work/i.test(item)
      )
    ).toBe(false);
  });

  it("keeps Current Priorities free of semantic Next Focus overlap", () => {
    const focus =
      "Strengthen Alex's confidence in using their project judgement";
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: {
        id: "p1",
        clientId: "c1",
        coachId: "coach",
        currentFocus: focus,
        strengths: [],
        values: [],
        motivators: [],
        emergingThemes: [],
        growthAreas: [
          {
            id: "g1",
            value: "Strengthen confidence in project judgement",
            status: "supported",
          },
          {
            id: "g2",
            value: "Earlier escalation conversations",
            status: "emerging",
          },
        ],
        coachingPreferences: [],
        beliefs: [],
        patterns: [],
        commitments: [],
        coachingPatterns: [],
        patternsEvidenceFingerprint: null,
        patternsGeneratedAt: null,
        createdAt: "",
        updatedAt: "",
      } as DevelopmentProfile,
    });

    expect(composed.nextDevelopmentFocus).toBe(focus);
    expect(composed.developmentPriorities).toEqual([
      "Earlier escalation conversations",
    ]);
    expect(
      filterSemanticDuplicates(composed.developmentPriorities, [
        composed.nextDevelopmentFocus,
      ])
    ).toEqual(composed.developmentPriorities);
  });
});
