"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Compass,
  Flag,
  Lightbulb,
  ListChecks,
  Route,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Client } from "@/lib/types";
import { apiJson, AuthRequiredError, errorMessage } from "@/lib/api-client";
import {
  buildProfessionalIdentityJourney,
  journeyAiEvidence,
  type JourneyInsight,
} from "@/lib/journey";
import { cleanJourneyLanguage } from "@/lib/journey/clean-journey-language";
import { EmergingEvidenceState } from "@/components/journey/emerging-evidence-state";
import { ClientWorkspaceTabs } from "@/components/client-workspace-tabs";
import { IDENTITY_EMPTY_STATES } from "@/lib/identity-empty-states";

type AiOverlay = {
  currentProfessionalIdentity: string | null;
  coachInsights: JourneyInsight[];
};

function evidenceFingerprint(client: Client): string {
  return journeyAiEvidence(client.sessions)
    .map(
      item =>
        `${item.sessionNumber}:${item.professionalIdentityDevelopment}|${item.strengthsObserved}|${item.valuesBecomingVisible}|${item.emergingThemes}|${item.agreedActions}|${item.coachReflection}`
    )
    .join("||");
}

export function JourneyView({
  client,
  onBack,
  onPrepare,
  onOpenSession,
  onCreateReport,
  onTabChange,
  loadingSessions = false,
}: {
  client: Client;
  onBack: () => void;
  onPrepare?: () => void;
  onOpenSession?: (sessionId: string) => void;
  onCreateReport?: () => void;
  onTabChange?: (tab: import("@/components/client-workspace-tabs").ClientWorkspaceTab) => void;
  loadingSessions?: boolean;
}) {
  const journey = useMemo(() => buildProfessionalIdentityJourney(client), [client]);
  const fingerprint = useMemo(() => evidenceFingerprint(client), [client]);
  const [aiOverlay, setAiOverlay] = useState<AiOverlay | null>(null);
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [aiError, setAiError] = useState("");

  const needsAi = journey.approvedSessionCount >= 2;

  useEffect(() => {
    if (!needsAi) {
      setAiOverlay(null);
      setAiStatus("idle");
      setAiError("");
      return;
    }

    let cancelled = false;
    const evidence = journeyAiEvidence(client.sessions);

    async function loadNarrative() {
      setAiStatus("loading");
      setAiError("");
      try {
        const payload = await apiJson<{
          currentProfessionalIdentity?: string | null;
          coachInsights?: string[];
        }>("/api/identity-journey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: client.id,
            relationshipId: client.id,
            clientName: client.name,
            evidence,
          }),
        });

        if (cancelled) return;

        const insights: JourneyInsight[] = (payload.coachInsights ?? []).slice(0, 3).map(
          (text, index) => ({
            id: `ai-insight-${index}`,
            text,
          })
        );

        setAiOverlay({
          currentProfessionalIdentity:
            payload.currentProfessionalIdentity?.trim() || journey.currentProfessionalIdentity,
          coachInsights: insights.length > 0 ? insights : journey.coachInsights.slice(0, 3),
        });
        setAiStatus("ready");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthRequiredError) {
          window.location.assign("/auth/sign-in?next=/?view=today");
          return;
        }
        setAiOverlay(null);
        setAiStatus("error");
        setAiError(
          errorMessage(
            error,
            "Unable to generate Journey narrative. Showing evidence-based record instead."
          )
        );
      }
    }

    void loadNarrative();
    return () => {
      cancelled = true;
    };
    // fingerprint captures approved evidence changes; journey fields used as fallbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, fingerprint, needsAi]);

  const currentIdentity = cleanJourneyLanguage(
    aiOverlay?.currentProfessionalIdentity ?? journey.currentProfessionalIdentity
  );
  const coachInsights = aiOverlay?.coachInsights ?? journey.coachInsights.slice(0, 3);
  const showLoading = loadingSessions;
  const showNarrativeLoading = needsAi && aiStatus === "loading";
  const showEmpty = !loadingSessions && journey.approvedSessionCount < 2;

  return (
    <section className="page">
      <button type="button" className="back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to Coach Space
      </button>

      {onTabChange && (
        <ClientWorkspaceTabs
          active="identity-journey"
          clientName={client.name}
          onChange={onTabChange}
        />
      )}

      <div className="page-heading row-between">
        <div>
          <p className="eyebrow">DEVELOPMENT JOURNEY</p>
          <h1>{client.name}</h1>
          <p>
            A clear narrative of development from approved coaching sessions — evidence based,
            coach controlled, never invented.
            {journey.approvedSessionCount > 0
              ? ` ${journey.approvedSessionCount} approved session${journey.approvedSessionCount === 1 ? "" : "s"} on record.`
              : " No approved sessions yet."}
          </p>
        </div>
        {onCreateReport && journey.approvedSessionCount >= 2 && (
          <div className="button-row page-heading-actions">
            <button type="button" className="primary" onClick={onCreateReport}>
              Create Coaching Report
            </button>
          </div>
        )}
      </div>

      {showLoading && (
        <div className="skeleton-loading-block" aria-busy="true" aria-live="polite">
          <span className="sr-only">Building Development Journey…</span>
          <div className="two-grid skeleton-two-grid">
            <article className="panel skeleton-card" aria-hidden>
              <div className="skeleton-block skeleton-label" />
              <div className="skeleton-block skeleton-line" />
              <div className="skeleton-block skeleton-line medium" />
            </article>
            <article className="panel skeleton-card" aria-hidden>
              <div className="skeleton-block skeleton-label" />
              <div className="skeleton-block skeleton-line" />
              <div className="skeleton-block skeleton-line short" />
            </article>
          </div>
        </div>
      )}

      {showNarrativeLoading && !showEmpty && (
        <p className="muted loading-inline" aria-live="polite">
          Refining the journey narrative…
        </p>
      )}

      {aiStatus === "error" && aiError && !showEmpty && (
        <div className="inline-error" role="status">
          <p>{aiError}</p>
        </div>
      )}

      {showEmpty ? (
        <article className="panel empty-panel empty-journey-panel">
          <p className="eyebrow">BUILDING THE JOURNEY</p>
          <h2>Your coaching record is taking shape</h2>
          <p className="muted empty-state">
            After two approved coaching sessions, this space will show how {client.name}&apos;s
            professional identity is evolving — strengths developing, values emerging, themes
            recurring, milestones reached, and open commitments.
          </p>
          <ul className="empty-promise-list">
            <li>Evidence based — drawn only from sessions you approve</li>
            <li>Coach controlled — you decide what enters the permanent record</li>
            <li>Never invented — nothing is assumed or fabricated</li>
          </ul>
          <p className="muted empty-state">
            {journey.approvedSessionCount === 0
              ? "Approve your first session to begin gathering the evidence."
              : `One more approved session and ${client.name}'s journey will appear here.`}
          </p>
          {onPrepare && (
            <div className="button-row">
              <button type="button" className="primary" onClick={onPrepare}>
                Prepare next session
              </button>
            </div>
          )}
        </article>
      ) : (
        <>
          <article className="identity-banner">
            <div>
              <p className="eyebrow light">CURRENT PROFESSIONAL IDENTITY</p>
              {currentIdentity ? (
                <p className="identity-paragraph">{currentIdentity}</p>
              ) : (
                <EmergingEvidenceState
                  title={IDENTITY_EMPTY_STATES.noEvidence.title}
                  description={IDENTITY_EMPTY_STATES.noEvidence.description}
                />
              )}
            </div>
          </article>

          <div className="intelligence-grid">
            <article className="panel wide">
              <div className="card-label">
                <Route size={17} /> IDENTITY EVOLUTION TIMELINE
              </div>
              {journey.identityEvolution.length === 0 ? (
                <p className="muted empty-journey">
                  Identity shifts will appear here as approved sessions record development.
                </p>
              ) : (
                <div className="timeline">
                  {journey.identityEvolution.map((event, index) => (
                    <div className="timeline-item" key={event.sessionId}>
                      <span className="timeline-dot" />
                      <span className="timeline-date">{event.date}</span>
                      <div className="timeline-card">
                        <h3>Session {event.sessionNumber}</h3>
                        <p>{event.title}</p>
                        {index < journey.identityEvolution.length - 1 ? (
                          <p className="timeline-arrow" aria-hidden="true">
                            ↓
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="panel">
              <div className="card-label">
                <Lightbulb size={17} /> STRENGTHS DEVELOPING
              </div>
              {journey.strengthsDeveloping.length === 0 ? (
                <EmergingEvidenceState
                  title="Strengths still emerging"
                  description="Strengths appear once they are observed in approved sessions."
                />
              ) : (
                <div className="evidence-list">
                  {journey.strengthsDeveloping.map(item => (
                    <div className="evidence-row" key={item.label}>
                      <div>
                        <strong>{item.label}</strong>
                        <p>
                          Observed in {item.sessionNumbers.length} session
                          {item.sessionNumbers.length === 1 ? "" : "s"}
                          {item.sessionNumbers.length
                            ? ` (${item.sessionNumbers.join(", ")})`
                            : ""}
                          .
                        </p>
                        <p className="muted small">
                          Most recent example: {item.latestExample}
                        </p>
                      </div>
                      <span className="pill">
                        {item.sessionNumbers.length} session
                        {item.sessionNumbers.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="panel">
              <div className="card-label">
                <Compass size={17} /> VALUES EMERGING
              </div>
              {journey.valuesEmerging.length === 0 ? (
                <p className="muted empty-journey">
                  Values appear here when the same value is evidenced in more than one approved
                  session.
                </p>
              ) : (
                <div className="value-list">
                  {journey.valuesEmerging.map(item => (
                    <div key={item.label}>
                      <strong>{item.label}</strong>
                      <p>
                        Visible in {item.sessionNumbers.length} sessions (
                        {item.sessionNumbers.join(", ")}).
                      </p>
                      <p className="muted small">
                        Most recent example: {item.latestExample}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="panel">
              <div className="card-label">
                <Sparkles size={17} /> RECURRING THEMES
              </div>
              {journey.recurringThemes.length === 0 ? (
                <p className="muted empty-journey">
                  Themes appear here when the same theme is recorded in more than one approved
                  session.
                </p>
              ) : (
                <div className="tag-wrap">
                  {journey.recurringThemes.map(item => (
                    <span className="tag" key={item.theme}>
                      {item.theme} · {item.count}
                    </span>
                  ))}
                </div>
              )}
            </article>

            <article className="panel">
              <div className="card-label">
                <Flag size={17} /> COACHING MILESTONES
              </div>
              {journey.coachingMilestones.length === 0 ? (
                <p className="muted empty-journey">
                  Milestones appear from agreed actions and identity development in approved
                  sessions.
                </p>
              ) : (
                <ul className="clean-list journey-milestone-list">
                  {journey.coachingMilestones.map((item, index) => (
                    <li key={`${item.sessionId}-${index}`}>
                      <strong>{item.title}</strong>
                      <p className="muted">
                        Session {item.sessionNumber}
                        {item.date ? ` · ${item.date}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="panel wide">
              <div className="card-label">
                <ListChecks size={17} /> OPEN COMMITMENTS
              </div>
              {journey.openCommitments.length === 0 ? (
                <p className="muted empty-journey">No open commitments on record.</p>
              ) : (
                <div className="action-list">
                  {journey.openCommitments.map(item => {
                    const canOpen = Boolean(item.sessionId && onOpenSession);
                    return (
                      <div key={item.id} className="action-row">
                        <span className="action-state" />
                        <div className="grow">
                          {canOpen ? (
                            <button
                              type="button"
                              className="text-link commitment-link"
                              onClick={() => onOpenSession?.(item.sessionId!)}
                            >
                              {item.title}
                            </button>
                          ) : (
                            <strong>{item.title}</strong>
                          )}
                          <small>{item.source}</small>
                        </div>
                        {item.status ? <span className="pill">{item.status}</span> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="panel wide coach-insight journey-insights">
              <div className="card-label light">
                <CheckCircle2 size={17} /> COACH INSIGHTS
              </div>
              {coachInsights.length === 0 ? (
                <p className="muted empty-journey light-muted">
                  Observations for your judgement will appear once approved sessions include
                  coach reflections.
                </p>
              ) : (
                <div className="journey-insight-list">
                  {coachInsights.map(insight => (
                    <div key={insight.id} className="journey-insight-item">
                      <p className="eyebrow light">POSSIBLE OBSERVATION</p>
                      <h2>
                        {insight.text.replace(/^Possible observation:\s*/i, "").trim()}
                      </h2>
                      <small>
                        {insight.sessionNumber != null
                          ? `Drawn from Session ${insight.sessionNumber}${insight.date ? ` · ${insight.date}` : ""}. `
                          : ""}
                        Offered for your judgement — not presented as fact.
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
