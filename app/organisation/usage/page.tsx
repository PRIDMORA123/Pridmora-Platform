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

export default function OrganisationUsagePage() {
  const [metrics, setMetrics] = useState<SafeOversightMetrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson<{ metrics: SafeOversightMetrics }>("/api/organisations/overview")
      .then(payload => setMetrics(payload.metrics))
      .catch(err =>
        setError(err instanceof Error ? err.message : "Unable to load usage.")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <OrganisationShell
      title="Usage"
      subtitle="Operational activity across this workspace."
    >
      <OrganisationInfoBanner>
        Usage shows operational counts only. No confidential coaching content is
        included.
      </OrganisationInfoBanner>

      {loading ? <p className="organisation-muted">Loading usage…</p> : null}
      {error ? <p className="organisation-error">{error}</p> : null}

      {metrics ? (
        <div className="organisation-metric-groups">
          <MetricGroup title="AI-supported activity">
            <MetricItem
              value={metrics.preparationUsageThisMonth}
              label="Preparations this month"
            />
            <MetricItem
              value={metrics.summariesAwaitingReview}
              label="Summaries awaiting review"
            />
          </MetricGroup>

          <MetricGroup title="Development activity">
            <MetricItem
              value={metrics.developmentUpdatesCompleted}
              label="Development updates completed"
            />
            <MetricItem
              value={metrics.reportsCount}
              label="Reports generated"
            />
          </MetricGroup>

          <MetricGroup title="Conversation activity">
            <MetricItem
              value={metrics.conversationsThisMonth}
              label="Conversations this month"
            />
          </MetricGroup>
        </div>
      ) : null}
    </OrganisationShell>
  );
}
