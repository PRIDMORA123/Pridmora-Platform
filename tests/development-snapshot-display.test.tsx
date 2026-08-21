/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DevelopmentSnapshot } from "@/components/development/development-snapshot";
import {
  visibleDevelopmentProfileSections,
  visibleDevelopmentSnapshotStory,
} from "@/lib/development-snapshot-display";
import type { DevelopmentSnapshotModel } from "@/lib/development-snapshot";
import type { DevelopmentTheme } from "@/types/development-profile";

function snapshotModel(
  overrides: Partial<DevelopmentSnapshotModel> = {}
): DevelopmentSnapshotModel {
  return {
    hasEnoughEvidence: true,
    currentDirection:
      "Leading through clearer delegation and manager accountability.",
    progressSinceLabel: "Progress since Session 1",
    areas: [
      { id: "t1", label: "Delegation", status: "strengthening" },
      { id: "t2", label: "Strategic focus", status: "emerging" },
    ],
    currentFocus:
      "Leading through clearer delegation and manager accountability.",
    evidenceNote: "Based on approved coaching evidence from Sessions 1–3.",
    ...overrides,
  };
}

describe("visibleDevelopmentSnapshotStory", () => {
  it("keeps What matters now and suppresses a paraphrased Current focus", () => {
    const story = visibleDevelopmentSnapshotStory(
      snapshotModel({
        currentFocus:
          "Continue exploring: leading through clearer delegation and manager accountability",
      })
    );

    expect(story.whatMattersNow).toContain("delegation");
    expect(story.currentFocus).toBeNull();
  });

  it("retains Current focus when it adds a different next step", () => {
    const story = visibleDevelopmentSnapshotStory(
      snapshotModel({
        currentFocus:
          "Hold the weekly risk review with the team lead instead of rewriting it.",
        areas: [{ id: "t2", label: "Strategic focus", status: "emerging" }],
      })
    );

    expect(story.currentFocus).toMatch(/risk review/i);
  });

  it("drops Recent progress items that repeat What matters now", () => {
    const story = visibleDevelopmentSnapshotStory(snapshotModel());
    expect(story.recentProgress.map(area => area.label)).toEqual([
      "Strategic focus",
    ]);
    expect(story.recentProgress.map(area => area.label)).not.toContain(
      "Delegation"
    );
  });

  it("drops Recent progress items that repeat a Recognised Pattern title", () => {
    const story = visibleDevelopmentSnapshotStory(
      snapshotModel({
        currentFocus:
          "Hold the weekly risk review with the team lead instead of rewriting it.",
        areas: [
          { id: "t2", label: "Strategic focus", status: "emerging" },
          { id: "t3", label: "Pacing decisions", status: "developing" },
        ],
      }),
      ["Pacing decisions under delivery pressure"]
    );

    expect(story.recentProgress.map(area => area.label)).toEqual([
      "Strategic focus",
    ]);
  });

  it("does not mutate the underlying snapshot model", () => {
    const snapshot = snapshotModel();
    visibleDevelopmentSnapshotStory(snapshot, ["Delegation"]);
    expect(snapshot.areas).toHaveLength(2);
    expect(snapshot.currentFocus).toContain("delegation");
    expect(snapshot.currentDirection).toContain("delegation");
  });
});

describe("visibleDevelopmentProfileSections", () => {
  it("hides themes, priorities and strengths that repeat the snapshot story", () => {
    const themes: DevelopmentTheme[] = [
      {
        id: "t1",
        name: "Delegation",
        confidence: "developing",
        narrative: "Leaving decisions with managers.",
        evidenceCount: 3,
      },
      {
        id: "t2",
        name: "Accountability",
        confidence: "developing",
        narrative: "Managers taking ownership.",
        evidenceCount: 2,
      },
      {
        id: "t5",
        name: "Board-level pacing",
        confidence: "emerging",
        narrative: "Pacing board updates without over-preparing.",
        evidenceCount: 1,
      },
    ];
    const visible = visibleDevelopmentProfileSections({
      snapshot: snapshotModel(),
      themes,
      lookingAhead: [
        "Continue exploring: Leading through clearer delegation and manager accountability.",
        "Protect thinking time on Thursday mornings.",
      ],
      emergingStrengths: ["Delegation", "Calm under board scrutiny"],
      blockedInsights: ["Accountability"],
    });

    expect(visible.story.whatMattersNow).toContain("delegation");
    expect(visible.lookingAhead).toEqual([
      "Protect thinking time on Thursday mornings.",
    ]);
    expect(visible.emergingStrengths).toEqual(["Calm under board scrutiny"]);
    expect(visible.themes.map(theme => theme.name)).toEqual([
      "Board-level pacing",
    ]);
  });
});

describe("DevelopmentSnapshot rendering", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders What matters now once and omits repeated focus and progress", () => {
    act(() => {
      root.render(
        <DevelopmentSnapshot
          snapshot={snapshotModel()}
          blockedInsights={[]}
        />
      );
    });

    expect(container.textContent).toContain("Current development");
    expect(container.textContent).toContain("What matters now?");
    expect(container.textContent).toContain(
      "Leading through clearer delegation and manager accountability."
    );
    expect(container.textContent).toContain("Strategic focus");
    expect(container.textContent).not.toContain("Current focus");
    expect(container.textContent).not.toMatch(/Current direction/);
    const bodyHits = container.querySelectorAll(
      ".development-snapshot__body"
    );
    expect(bodyHits).toHaveLength(1);
  });
});
