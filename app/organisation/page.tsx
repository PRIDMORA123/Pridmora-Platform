"use client";

import { useEffect, useState } from "react";
import { OrganisationShell } from "@/components/organisation/organisation-shell";
import { OrganisationInfoBanner } from "@/components/organisation/organisation-info-banner";
import {
  MetricGroup,
  MetricItem,
} from "@/components/organisation/metric-group";
import { apiJson } from "@/lib/api-client";
import type { SafeOversightMetrics } from "@/lib/organisations/types";

export default function OrganisationOverviewPage() {
  const [metrics, setMetrics] = useState<SafeOversightMetrics | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await apiJson<{
          metrics: SafeOversightMetrics;
          confidentialityNote: string;
        }>("/api/organisations/overview");
        if (!active) return;
        setMetrics(payload.metrics);
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

      {metrics ? (
        <>
          <OrganisationInfoBanner>{note}</OrganisationInfoBanner>

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
        </>
      ) : null}
    </OrganisationShell>
  );
}
