"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerEmpty } from "@/components/owner/owner-empty";
import { OwnerStatus } from "@/components/owner/owner-status";
import { apiJson } from "@/lib/api-client";
import { formatMoneyMinor } from "@/lib/owner/money";
import type { CustomerHealth } from "@/lib/owner/types";

type OverviewPayload = {
  totals: {
    activeOrganisations: number;
    trialOrganisations: number;
    totalManagers: number;
    totalTeamMembers: number;
    activeUsers30d: number;
    conversations30d: number;
    aiRequests30d: number;
  };
  commercial: {
    mrrMinor: number | null;
    arrMinor: number | null;
    outstandingInvoices: number;
    overdueValueMinor: number | null;
    valuesAvailable: boolean;
    trialsEndingSoon: number;
  };
  organisationHealth: Array<{
    id: string;
    name: string;
    health: CustomerHealth;
    accountStatus: string;
  }>;
  needsAttention: Array<{
    id: string;
    name: string;
    reasons: string[];
    accountStatus: string;
    actionLabel: string;
  }>;
  trialsEndingSoon: Array<{
    id: string;
    organisationId: string;
    trialEndsAt: string;
    conversionStatus: string;
  }>;
  commercialAttention: Array<{
    id: string;
    organisationId: string;
    invoiceNumber: string;
    grossMinor: number;
    currency: string;
    dueDate: string | null;
    status: string;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    organisationId: string | null;
    createdAt: string;
  }>;
  platformHealth: {
    note: string;
  };
};

export default function OwnerOverviewPage() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await apiJson<OverviewPayload>("/api/owner/overview");
        if (!active) return;
        setData(payload);
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

  return (
    <OwnerShell
      title="Platform Overview"
      subtitle="A clear view of organisations, adoption, commercial activity and platform health."
    >
      {loading ? <p className="owner-muted">Loading platform overview…</p> : null}
      {error ? <p className="owner-error">{error}</p> : null}

      {data ? (
        <>
          <section className="owner-section" aria-label="Key metrics">
            <div className="owner-metrics">
              <Metric value={data.totals.activeOrganisations} label="Active organisations" />
              <Metric value={data.totals.trialOrganisations} label="Trial organisations" />
              <Metric value={data.totals.totalManagers} label="Total managers" />
              <Metric value={data.totals.totalTeamMembers} label="Total team members" />
              <Metric value={data.totals.activeUsers30d} label="Active users — last 30 days" />
              <Metric
                value={data.totals.conversations30d}
                label="Development conversations — last 30 days"
              />
              <Metric value={data.totals.aiRequests30d} label="AI requests — last 30 days" />
              <Metric
                value={data.commercial.trialsEndingSoon}
                label="Trials ending soon"
              />
              <Metric
                value={data.commercial.outstandingInvoices}
                label="Outstanding invoices"
              />
              <Metric
                value={
                  data.commercial.valuesAvailable
                    ? formatMoneyMinor(data.commercial.mrrMinor)
                    : "Not available"
                }
                label="Monthly recurring revenue"
              />
              <Metric
                value={
                  data.commercial.valuesAvailable
                    ? formatMoneyMinor(data.commercial.arrMinor)
                    : "Not available"
                }
                label="Annual recurring revenue"
              />
            </div>
          </section>

          <div className="owner-panels">
            <section className="owner-panel owner-panel--attention" aria-labelledby="needs-attention">
              <h2 className="owner-panel__title" id="needs-attention">
                Needs attention
              </h2>
              {data.needsAttention.length === 0 &&
              data.commercialAttention.length === 0 ? (
                <OwnerEmpty
                  title="Nothing requires action"
                  description="Organisations and commercial items look calm right now."
                />
              ) : (
                <ul className="owner-attention-list">
                  {data.needsAttention.map(item => (
                    <li key={item.id} className="owner-attention-item">
                      <p className="owner-attention-item__title">{item.name}</p>
                      <p className="owner-attention-item__meta">
                        {item.reasons.slice(0, 3).join(" · ")}
                      </p>
                      <Link
                        href={`/owner/organisations/${item.id}`}
                        className="owner-attention-item__action"
                      >
                        {item.actionLabel}
                      </Link>
                    </li>
                  ))}
                  {data.commercialAttention.map(item => (
                    <li key={item.id} className="owner-attention-item">
                      <p className="owner-attention-item__title">
                        Invoice {item.invoiceNumber}
                      </p>
                      <p className="owner-attention-item__meta">
                        {formatMoneyMinor(item.grossMinor, item.currency)} overdue
                        {item.dueDate ? ` · due ${item.dueDate}` : ""}
                      </p>
                      <Link
                        href={`/owner/organisations/${item.organisationId}`}
                        className="owner-attention-item__action"
                      >
                        Review account
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="owner-panel" aria-labelledby="org-health">
              <h2 className="owner-panel__title" id="org-health">
                Organisation health
              </h2>
              {data.organisationHealth.length === 0 ? (
                <OwnerEmpty
                  title="No organisations yet"
                  description="When customer organisations are created, health signals will appear here."
                />
              ) : (
                <ul className="owner-attention-list">
                  {data.organisationHealth.map(org => (
                    <li key={org.id} className="owner-attention-item">
                      <p className="owner-attention-item__title">
                        <Link href={`/owner/organisations/${org.id}`}>{org.name}</Link>
                      </p>
                      <OwnerStatus
                        value={org.health.level}
                        label={org.health.label}
                      />
                      <p className="owner-attention-item__meta">
                        {org.health.reasons[0]}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="owner-panels">
            <section className="owner-panel" aria-labelledby="recent-activity">
              <h2 className="owner-panel__title" id="recent-activity">
                Recent platform activity
              </h2>
              {data.recentActivity.length === 0 ? (
                <p className="owner-muted">No owner audit events yet.</p>
              ) : (
                <ul className="owner-attention-list">
                  {data.recentActivity.map(event => (
                    <li key={event.id} className="owner-attention-item">
                      <p className="owner-attention-item__title">{event.action}</p>
                      <p className="owner-attention-item__meta">
                        {event.entityType} · {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="owner-panel" aria-labelledby="platform-health">
              <h2 className="owner-panel__title" id="platform-health">
                Platform health
              </h2>
              <p className="owner-muted">{data.platformHealth.note}</p>
              <p style={{ marginTop: "0.75rem" }}>
                <Link href="/owner/health" className="owner-attention-item__action">
                  Open platform health
                </Link>
              </p>
            </section>
          </div>

          <section className="owner-panel" aria-labelledby="trials-ending">
            <h2 className="owner-panel__title" id="trials-ending">
              Trials ending soon
            </h2>
            {data.trialsEndingSoon.length === 0 ? (
              <p className="owner-muted">No trials ending within 14 days.</p>
            ) : (
              <ul className="owner-attention-list">
                {data.trialsEndingSoon.map(trial => (
                  <li key={trial.id} className="owner-attention-item">
                    <p className="owner-attention-item__title">
                      <Link href={`/owner/organisations/${trial.organisationId}`}>
                        Trial ends {trial.trialEndsAt}
                      </Link>
                    </p>
                    <p className="owner-attention-item__meta">
                      Conversion: {trial.conversionStatus.replaceAll("_", " ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </OwnerShell>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="owner-metric">
      <p className="owner-metric__value">{value}</p>
      <p className="owner-metric__label">{label}</p>
    </div>
  );
}
