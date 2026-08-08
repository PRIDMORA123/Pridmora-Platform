"use client";

import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerStatus } from "@/components/owner/owner-status";
import { apiJson } from "@/lib/api-client";

type HealthPayload = {
  services: Array<{
    id: string;
    label: string;
    status: string;
    detail: string;
  }>;
  metrics: {
    failedRequests: number | null;
    recentServerErrors: number | null;
    aiFailureCount: number | null;
    authenticationFailures: number | null;
    responseTimeMs: number | null;
  };
  notes: string[];
};

export default function OwnerHealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await apiJson<HealthPayload>("/api/owner/health");
        if (!active) return;
        setData(payload);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load platform health.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <OwnerShell
      title="Platform Health"
      subtitle="Operational status for core platform services. Fake uptime is never shown."
    >
      {loading ? <p className="owner-muted">Loading platform health…</p> : null}
      {error ? <p className="owner-error">{error}</p> : null}

      {data ? (
        <>
          <section className="owner-metrics" aria-label="Services">
            {data.services.map(service => (
              <div key={service.id} className="owner-metric">
                <p className="owner-metric__label">{service.label}</p>
                <p style={{ margin: "0.35rem 0" }}>
                  <OwnerStatus
                    value={service.status}
                    label={
                      service.status === "unknown"
                        ? "Unknown"
                        : service.status.charAt(0).toUpperCase() +
                          service.status.slice(1)
                    }
                  />
                </p>
                <p className="owner-metric__label">{service.detail}</p>
              </div>
            ))}
          </section>

          <section className="owner-panel">
            <h2 className="owner-panel__title">Operational metrics</h2>
            <div className="owner-metrics">
              <Metric
                value={data.metrics.failedRequests}
                label="Failed requests"
              />
              <Metric
                value={data.metrics.recentServerErrors}
                label="Recent server errors"
              />
              <Metric value={data.metrics.aiFailureCount} label="AI failure count" />
              <Metric
                value={data.metrics.authenticationFailures}
                label="Authentication failures"
              />
              <Metric
                value={data.metrics.responseTimeMs}
                label="Response time (ms)"
              />
            </div>
            <ul className="owner-health-reasons">
              {data.notes.map(note => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </OwnerShell>
  );
}

function Metric({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  return (
    <div className="owner-metric">
      <p className="owner-metric__value">
        {value === null ? "Monitoring not configured" : value}
      </p>
      <p className="owner-metric__label">{label}</p>
    </div>
  );
}
