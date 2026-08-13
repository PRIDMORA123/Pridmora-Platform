"use client";

import { useEffect, useState } from "react";
import { OrganisationShell } from "@/components/organisation/organisation-shell";
import { OrganisationInfoBanner } from "@/components/organisation/organisation-info-banner";
import {
  MetricGroup,
  MetricItem,
} from "@/components/organisation/metric-group";
import {
  ManagerDevelopmentIntelligenceView,
  type ManagerDevelopmentLeadPayload,
} from "@/components/organisation/manager-development-intelligence-view";
import { apiJson } from "@/lib/api-client";
import type { SafeOversightMetrics } from "@/lib/organisations/types";

type SeatsPayload = {
  seatsPurchased: number;
  seatsInUse: number;
  seatsAvailable: number;
  label: string;
};

export default function OrganisationOverviewPage() {
  const [metrics, setMetrics] = useState<SafeOversightMetrics | null>(null);
  const [seats, setSeats] = useState<SeatsPayload | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [development, setDevelopment] =
    useState<ManagerDevelopmentLeadPayload | null>(null);
  const [developmentError, setDevelopmentError] = useState("");
  const [developmentLoading, setDevelopmentLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await apiJson<{
          metrics: SafeOversightMetrics;
          seats?: SeatsPayload;
          confidentialityNote: string;
        }>("/api/organisations/overview");
        if (!active) return;
        setMetrics(payload.metrics);
        setSeats(payload.seats ?? null);
        setNote(payload.confidentialityNote);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load overview.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await apiJson<ManagerDevelopmentLeadPayload>(
          "/api/organisations/manager-development-intelligence"
        );
        if (!active) return;
        setDevelopment(payload);
      } catch (err) {
        if (!active) return;
        // Overview remains usable without development intelligence access.
        setDevelopmentError(
          err instanceof Error
            ? err.message
            : "Manager Development Intelligence is unavailable."
        );
      } finally {
        if (active) setDevelopmentLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const isPersonal = metrics?.organisationType === "personal";
  const title = metrics?.organisationName || "Overview";
  const subtitle = metrics
    ? isPersonal
      ? "Personal workspace"
      : "Organisation workspace"
    : undefined;

  return (
    <OrganisationShell title={title} subtitle={subtitle}>
      {loading ? (
        <p className="organisation-muted">Loading operational overview…</p>
      ) : null}
      {error ? <p className="organisation-error">{error}</p> : null}

      {developmentLoading ? (
        <p className="organisation-muted">
          Loading organisation development summary…
        </p>
      ) : null}
      {developmentError && !development ? (
        <p className="organisation-muted">{developmentError}</p>
      ) : null}
      {development ? (
        <ManagerDevelopmentIntelligenceView
          data={development}
          variant="overview"
        />
      ) : null}

      {metrics ? (
        <>
          <OrganisationInfoBanner>{note}</OrganisationInfoBanner>

          {seats ? (
            <div className="organisation-seats-summary organisation-seats-summary--overview">
              <p className="organisation-seats-summary__label">Seats</p>
              <p className="organisation-seats-summary__value">{seats.label}</p>
            </div>
          ) : null}

          <section
            className="organisation-ops"
            aria-labelledby="organisation-ops-heading"
          >
            <h2 id="organisation-ops-heading" className="organisation-section-title">
              Operational overview
            </h2>
            <p className="organisation-muted organisation-ops__intro">
              Administrative counts for organisation health. These are separate
              from Manager Development Intelligence.
            </p>

            <div className="organisation-metric-groups">
              <MetricGroup title="People">
                <MetricItem
                  value={metrics.activeMembers}
                  label={
                    metrics.activeMembers === 1
                      ? "Active member"
                      : "Active members"
                  }
                />
                <MetricItem
                  value={metrics.practitioners}
                  label={
                    metrics.practitioners === 1
                      ? "Active practitioner"
                      : "Active practitioners"
                  }
                />
                <MetricItem
                  value={metrics.activeRelationships}
                  label={
                    metrics.activeRelationships === 1
                      ? "Active relationship"
                      : "Active relationships"
                  }
                />
              </MetricGroup>

              <MetricGroup title="Workflow">
                <MetricItem
                  value={metrics.conversationsThisMonth}
                  label="Conversations this month"
                />
                <MetricItem
                  value={metrics.awaitingSessionNotes}
                  label="Awaiting session notes"
                />
                <MetricItem
                  value={metrics.summariesAwaitingReview}
                  label="Summaries awaiting review"
                />
              </MetricGroup>

              <MetricGroup title="Platform activity">
                <MetricItem
                  value={metrics.preparationUsageThisMonth}
                  label="Preparations"
                />
                <MetricItem
                  value={metrics.developmentUpdatesCompleted}
                  label="Development updates"
                />
                <MetricItem value={metrics.reportsCount} label="Reports" />
              </MetricGroup>
            </div>
          </section>
        </>
      ) : null}
    </OrganisationShell>
  );
}
