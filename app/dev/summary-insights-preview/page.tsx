"use client";

import { useMemo, useState } from "react";
import { RelationshipIdentityBar } from "@/components/coaching-journey/relationship-identity-bar";
import { StageHeader } from "@/components/coaching-journey/stage-header";
import { JourneyNextStep } from "@/components/coaching-journey/journey-next-step";
import { SummaryInsightsView } from "@/components/summary-insights/summary-insights-view";
import { SessionsLoadError } from "@/components/feedback/sessions-load-error";
import type { SummaryInsightsContent } from "@/lib/summary-insights/types";
import { STAGE_ORIENTATION_COPY } from "@/lib/coaching-journey";
import type { SummaryStatus } from "@/lib/types";
import "@/components/summary-insights/summary-insights.css";
import "@/components/identity-intelligence/identity-intelligence.css";

const SARAH_STRUCTURED: SummaryInsightsContent = {
  sessionSummary:
    "Sarah explored the pressure of holding too much ownership as her leadership remit widened. The conversation focused on delegation, standards, and how she steps back into the work when discomfort rises.",
  keyInsights: [
    {
      title: "Delegation and ownership",
      description:
        "Sarah recognised that retaining detailed ownership was limiting her team’s growth and consuming her capacity.",
    },
    {
      title: "Leadership development",
      description:
        "She connected leadership presence with clearer expectations rather than closer control of the work.",
    },
  ],
  strengths: [
    {
      title: "Self-awareness",
      description:
        "Sarah could name the moment she takes work back from others.",
    },
  ],
  developmentEvidence: [
    {
      title: "Emerging leadership shift",
      description:
        "She described one recent attempt to leave a decision with a direct report.",
    },
  ],
  coachingContext:
    "Sarah is adjusting to a broader leadership remit with rising stakeholder demands.",
  commitments: [
    "Agree one decision her team lead will own this week",
    "Pause before reclaiming a task and name the standard instead",
  ],
  possibleNextFocus: [
    "How standards can be held without reabsorbing work",
  ],
  evidenceQualification:
    "The notes do not yet provide sufficient evidence of sustained behavioural change.",
};

export default function SummaryInsightsPreviewPage() {
  const [status, setStatus] = useState<SummaryStatus>("draft");
  const [showSessionsError, setShowSessionsError] = useState(false);
  const orientation = STAGE_ORIENTATION_COPY.summary_insights;

  const content = useMemo(() => SARAH_STRUCTURED, []);

  if (process.env.NODE_ENV === "production") {
    return <main style={{ padding: 40 }}>Preview unavailable.</main>;
  }

  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "32px 20px 64px",
        fontFamily: "var(--font-poppins, Poppins, sans-serif)",
      }}
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <button type="button" onClick={() => setStatus("draft")}>
          Draft
        </button>
        <button type="button" onClick={() => setStatus("approved")}>
          Approved
        </button>
        <button type="button" onClick={() => setShowSessionsError(current => !current)}>
          Toggle sessions error
        </button>
      </div>

      <button type="button" className="back" style={{ marginBottom: 16 }}>
        ← Back to Current Position
      </button>

      <RelationshipIdentityBar
        clientName="Sarah Thompson"
        role="Operations Manager"
        organisation="Northbridge NHS Trust"
        sessionNumber={1}
        sessionTitle="Confidence building"
        sessionDate="2026-08-01"
        status="awaiting_completion"
      />

      <StageHeader
        eyebrow={orientation.eyebrow || "Summary & Insights"}
        title={orientation.title}
        description={orientation.description}
        optional={orientation.optional}
      />

      {showSessionsError ? (
        <SessionsLoadError
          onRetry={() => setShowSessionsError(false)}
          onReturn={() => setShowSessionsError(false)}
        />
      ) : null}

      <SummaryInsightsView content={content} status={status} />

      <JourneyNextStep
        now="Reviewing Summary & Insights"
        next="Approve the summary or skip it and continue to Development."
      />
    </main>
  );
}
