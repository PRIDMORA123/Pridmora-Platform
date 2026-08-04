"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  Lightbulb,
  Quote,
  Target,
} from "lucide-react";
import { useMemo } from "react";
import type { Client } from "@/lib/types";
import { buildProfessionalIdentityJourney } from "@/lib/journey";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";

export function IntelligenceView({
  client,
  onBack,
  onJourney,
}: {
  client: Client;
  onBack: () => void;
  onJourney: () => void;
}) {
  const journey = useMemo(() => buildProfessionalIdentityJourney(client), [client]);

  return (
    <section className="page">
      <button type="button" className="back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to Coach Space
      </button>
      <div className="page-heading">
        <p className="eyebrow">CLIENT BRIEFING</p>
        <h1>{getRelationshipDisplayName(client)}</h1>
        <p>What you need to prepare, think and reflect before the next conversation.</p>
      </div>

      <article className="identity-banner">
        <div>
          <p className="eyebrow light">CURRENT PROFESSIONAL IDENTITY</p>
          <h2>
            {journey.currentProfessionalIdentity ??
              client.identitySummary ??
              "Professional identity will appear here from approved coaching sessions."}
          </h2>
        </div>
      </article>

      <div className="intelligence-grid">
        <article className="panel wide">
          <div className="card-label">
            <Lightbulb size={17} /> STRENGTHS
          </div>
          {client.strengths.length === 0 ? (
            <p className="muted empty-state">Strengths will appear as you record them in sessions.</p>
          ) : (
            <div className="evidence-list">
              {client.strengths.map(item => (
                <div className="evidence-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.evidence}</p>
                  </div>
                  <span className="pill">{item.stage}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="card-label">
            <Compass size={17} /> VALUES
          </div>
          {client.values.length === 0 ? (
            <p className="muted empty-state">Values will appear as they become visible in conversation.</p>
          ) : (
            <div className="value-list">
              {client.values.map(value => (
                <div key={value.id}>
                  <strong>{value.name}</strong>
                  <p>{value.evidence}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="card-label">
            <Target size={17} /> GOALS
          </div>
          {client.goals.length === 0 ? (
            <p className="muted empty-state">Goals will appear once agreed in coaching.</p>
          ) : (
            <ul className="clean-list">
              {client.goals.map(goal => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel wide">
          <div className="card-label">
            <CheckCircle2 size={17} /> COMMITMENTS
          </div>
          {client.actions.length === 0 ? (
            <p className="muted empty-state">Open commitments will appear here after sessions.</p>
          ) : (
            <div className="action-list">
              {client.actions.map(action => (
                <div key={action.id} className="action-row">
                  <span
                    className={`action-state ${action.status === "Complete" ? "done" : ""}`}
                  />
                  <div className="grow">
                    <strong>{action.title}</strong>
                    <small>{action.due ? `Due ${action.due}` : "No due date"}</small>
                  </div>
                  <span className="pill">{action.status}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="card-label">THEMES</div>
          {client.themes.length === 0 ? (
            <p className="muted empty-state">Themes will emerge across approved sessions.</p>
          ) : (
            <div className="tag-wrap">
              {client.themes.map(theme => (
                <span className="tag" key={theme}>
                  {theme}
                </span>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="card-label">
            <Quote size={17} /> KEY QUOTES
          </div>
          {client.quotes.length === 0 ? (
            <p className="muted empty-state">Key phrases from conversation will appear here.</p>
          ) : (
            client.quotes.map(quote => (
              <blockquote className="small-quote" key={quote}>
                “{quote}”
              </blockquote>
            ))
          )}
        </article>

        <article className="panel wide">
          <div className="card-label">DEVELOPMENT JOURNEY</div>
          {journey.identityEvolution.length === 0 ? (
            <p className="muted empty-state">
              Development evolution appears from approved coaching sessions.
            </p>
          ) : (
            <div className="timeline">
              {journey.identityEvolution.map(event => (
                <div className="timeline-item" key={event.sessionId}>
                  <span className="timeline-dot" />
                  <span className="timeline-date">{event.date}</span>
                  <div className="timeline-card">
                    <h3>
                      Session {event.sessionNumber}: {event.title}
                    </h3>
                    <p>{event.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="text-link" onClick={onJourney}>
            Open Development Journey <ArrowRight size={16} />
          </button>
        </article>

        <article className="coach-insight">
          <p className="eyebrow light">POSSIBLE OBSERVATION</p>
          <h2>
            {(
              journey.coachInsights[0]?.text ??
              client.coachInsight
            ).replace(/^Possible observation:\s*/i, "").trim()}
          </h2>
          <small>
            Offered for your judgement — not presented as fact.
          </small>
        </article>
      </div>
    </section>
  );
}
