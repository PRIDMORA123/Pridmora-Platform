"use client";

import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Client } from "@/lib/types";
import { apiJson } from "@/lib/api-client";
import {
  ClientWorkspaceTabs,
  type ClientWorkspaceTab,
} from "@/components/client-workspace-tabs";
import {
  ClientIdentityHeader,
  IdentityEmptyState,
  IdentitySection,
} from "@/components/identity";
import { RelationshipIsolationFailsafe } from "@/components/relationship-isolation-failsafe";
import { coachingStatusLabel } from "@/lib/identity-journey-path";
import {
  buildClientJourneySnapshot,
  timelineStatusLabel,
} from "@/lib/client-journey";
import type { DevelopmentUpdate } from "@/lib/development-updates/types";
import { assertRelationshipOwnership } from "@/lib/relationship-scope";

export function CareerJourneyView({
  client,
  onBack,
  onTabChange,
}: {
  client: Client;
  onBack: () => void;
  onTabChange: (tab: ClientWorkspaceTab) => void;
}) {
  const events = client.journey ?? [];
  const [updates, setUpdates] = useState<DevelopmentUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isolationError, setIsolationError] = useState(false);

  const load = useCallback(async () => {
    setUpdates([]);
    setIsolationError(false);
    setLoading(true);
    try {
      const data = await apiJson<{
        updates?: DevelopmentUpdate[];
      }>(`/api/development-profiles/${client.id}`).catch(() => null);
      const next = (data?.updates ?? []).filter(
        update => update.clientId === client.id
      );
      assertRelationshipOwnership(client.id, next);
      assertRelationshipOwnership(
        client.id,
        client.sessions.map(session => ({ relationshipId: session.clientId }))
      );
      setUpdates(next);
    } catch (err) {
      console.error("[relationship-isolation] History integrity check failed", {
        relationshipId: client.id,
        error: err,
      });
      setIsolationError(true);
      setUpdates([]);
    } finally {
      setLoading(false);
    }
  }, [client.id, client.sessions]);

  useEffect(() => {
    void load();
  }, [load]);

  const journey = useMemo(
    () => buildClientJourneySnapshot(client, updates),
    [client, updates]
  );

  if (isolationError) {
    return <RelationshipIsolationFailsafe />;
  }

  if (loading) {
    return (
      <section className="page identity-reveal" aria-busy="true">
        <button type="button" className="back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden /> Back to Current Position
        </button>
        <ClientWorkspaceTabs
          active="overview"
          activeStage="current_position"
          onChange={onTabChange}
          client={client}
        />
        <p className="muted">Loading records…</p>
      </section>
    );
  }

  return (
    <section className="page identity-reveal">
      <button type="button" className="back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden /> Back to Current Position
      </button>

      <ClientWorkspaceTabs
        active="overview"
        activeStage="current_position"
        onChange={onTabChange}
        client={client}
      />

      <ClientIdentityHeader
        name={client.name}
        role={client.role}
        organisation={client.organisation}
        journeyStage={coachingStatusLabel(client, updates)}
        developmentFocus={client.currentFocus.trim() || null}
        latestConversationDate={
          journey.mostRecentCompleted
            ? journey.mostRecentSessionDateLabel
            : null
        }
      />

      <IdentitySection
        title="Records"
        description="What has been recorded for this coaching relationship."
      >
        {journey.fullHistory.length === 0 && events.length === 0 ? (
          <IdentityEmptyState
            title="This will be the first development conversation in this coaching relationship."
            description="Completed conversations will appear here as the coaching journey unfolds."
          />
        ) : (
          <ol className="client-journey-timeline">
            {journey.fullHistory.map(item => (
              <li key={item.id} data-status={item.status.toLowerCase()}>
                <span className="client-journey-timeline-label">{item.label}</span>
                <span className="client-journey-timeline-status">
                  {timelineStatusLabel(item.status)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </IdentitySection>

      {events.length > 0 ? (
        <IdentitySection
          title="Career and life context"
          description="Broader context recorded for this person, kept separate from coaching evidence."
        >
          <div className="timeline">
            {events.map(event => (
              <article key={event.id} className="timeline-item">
                <h3>{event.title}</h3>
                {event.date ? <p className="muted small">{event.date}</p> : null}
                {event.detail ? <p>{event.detail}</p> : null}
              </article>
            ))}
          </div>
        </IdentitySection>
      ) : null}
    </section>
  );
}
