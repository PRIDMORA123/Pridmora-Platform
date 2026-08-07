"use client";

import type { HomeAttentionItem, HomeWorkspaceViewModel } from "@/lib/home-workspace";

export function ManagerCommandCentre({
  greeting,
  coachName,
  todayAttention,
  recentDevelopment,
  overview,
  canOpenOrganisation,
  onAttentionAction,
  onOpenPerson,
  onOpenPeople,
  onOpenMyDevelopment,
  onOpenOrganisation,
  onOpenEvidence,
}: {
  greeting: string;
  coachName: string;
  todayAttention: HomeAttentionItem[];
  recentDevelopment: HomeWorkspaceViewModel["recentDevelopment"];
  overview: HomeWorkspaceViewModel["overview"];
  canOpenOrganisation?: boolean;
  onAttentionAction: (item: HomeAttentionItem) => void;
  onOpenPerson: (relationshipId: string) => void;
  onOpenPeople: () => void;
  onOpenMyDevelopment: () => void;
  onOpenOrganisation?: () => void;
  onOpenEvidence?: () => void;
}) {
  return (
    <section className="manager-command-centre identity-reveal">
      <header className="manager-command-centre__header">
        <p className="eyebrow">Manager command centre</p>
        <h1>
          {greeting}, {coachName}
        </h1>
        <p className="manager-command-centre__question">
          What needs my attention today?
        </p>
      </header>

      <section
        className="manager-command-centre__panel"
        aria-labelledby="today-attention-title"
      >
        <h2 id="today-attention-title">Today</h2>
        {todayAttention.length === 0 ? (
          <p className="manager-command-centre__empty">
            You’re up to date. No immediate development actions need your
            attention.
          </p>
        ) : (
          <ul className="manager-command-centre__attention-list">
            {todayAttention.map(item => (
              <li key={item.id} className="manager-command-centre__attention-item">
                <div>
                  <p className="manager-command-centre__attention-title">
                    {item.title}
                  </p>
                  <p className="muted">{item.explanation}</p>
                </div>
                <button
                  type="button"
                  className="identity-button is-primary"
                  onClick={() => onAttentionAction(item)}
                >
                  {item.actionLabel}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="manager-command-centre__panel"
        aria-labelledby="what-changed-title"
      >
        <h2 id="what-changed-title">What has changed</h2>
        {recentDevelopment.length === 0 ? (
          <p className="muted">No recent development changes to highlight yet.</p>
        ) : (
          <ul className="manager-command-centre__change-list">
            {recentDevelopment.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  className="manager-command-centre__change-link"
                  onClick={() => onOpenPerson(item.relationshipId)}
                >
                  <strong>{item.personName}</strong>
                  <span>{item.change}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="manager-command-centre__panel manager-command-centre__picture"
        aria-labelledby="development-picture-title"
      >
        <h2 id="development-picture-title">Your development picture</h2>
        <dl className="manager-command-centre__metrics">
          <div>
            <dt>People supported</dt>
            <dd>{overview.activeRelationships}</dd>
          </div>
          <div>
            <dt>Conversations in progress</dt>
            <dd>{overview.conversationsInProgress}</dd>
          </div>
          <div>
            <dt>Awaiting preparation</dt>
            <dd>{overview.awaitingPreparation}</dd>
          </div>
          <div>
            <dt>Recent conversations</dt>
            <dd>{overview.recentReflections}</dd>
          </div>
        </dl>
      </section>

      <section
        className="manager-command-centre__panel"
        aria-labelledby="quick-actions-title"
      >
        <h2 id="quick-actions-title">Quick actions</h2>
        <div className="manager-command-centre__actions">
          <button type="button" className="secondary" onClick={onOpenPeople}>
            Open People
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onOpenMyDevelopment}
          >
            My Development
          </button>
          {canOpenOrganisation && onOpenOrganisation ? (
            <button
              type="button"
              className="secondary"
              onClick={onOpenOrganisation}
            >
              Organisation Intelligence
            </button>
          ) : null}
          {onOpenEvidence ? (
            <button type="button" className="secondary" onClick={onOpenEvidence}>
              Review Development Evidence
            </button>
          ) : null}
        </div>
      </section>
    </section>
  );
}
