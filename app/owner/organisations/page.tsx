"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerEmpty } from "@/components/owner/owner-empty";
import { OwnerStatus } from "@/components/owner/owner-status";
import { apiJson } from "@/lib/api-client";
import type { OwnerOrganisationListItem } from "@/lib/owner/types";
import { ACCOUNT_STATUS_LABELS } from "@/lib/owner/types";

export default function OwnerOrganisationsPage() {
  const [organisations, setOrganisations] = useState<OwnerOrganisationListItem[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("status", status);
    if (plan !== "all") params.set("plan", plan);

    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const payload = await apiJson<{ organisations: OwnerOrganisationListItem[] }>(
          `/api/owner/organisations?${params.toString()}`
        );
        if (!active) return;
        setOrganisations(payload.organisations);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load organisations.");
      } finally {
        if (active) setLoading(false);
      }
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [search, status, plan]);

  const plans = useMemo(() => {
    const set = new Set(organisations.map(org => org.planName).filter(Boolean));
    return Array.from(set).sort();
  }, [organisations]);

  return (
    <OwnerShell
      title="Organisations"
      subtitle="Search and manage customer organisations across the platform."
    >
      <div className="owner-filters">
        <div className="owner-field">
          <label htmlFor="owner-org-search">Search</label>
          <input
            id="owner-org-search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Organisation or contact"
          />
        </div>
        <div className="owner-field">
          <label htmlFor="owner-org-status">Account status</label>
          <select
            id="owner-org-status"
            value={status}
            onChange={event => setStatus(event.target.value)}
          >
            <option value="all">All</option>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="owner-field">
          <label htmlFor="owner-org-plan">Plan</label>
          <select
            id="owner-org-plan"
            value={plan}
            onChange={event => setPlan(event.target.value)}
          >
            <option value="all">All</option>
            {plans.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <p className="owner-muted">Loading organisations…</p> : null}
      {error ? <p className="owner-error">{error}</p> : null}

      {!loading && organisations.length === 0 ? (
        <OwnerEmpty
          title="No organisations found"
          description="There are no matching customer organisations yet. Personal workspaces are excluded from this list."
        />
      ) : null}

      {organisations.length > 0 ? (
        <>
          <div className="owner-table-wrap">
            <table className="owner-table">
              <thead>
                <tr>
                  <th scope="col">Organisation</th>
                  <th scope="col">Primary contact</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Managers</th>
                  <th scope="col">Team members</th>
                  <th scope="col">Account status</th>
                  <th scope="col">Customer health</th>
                  <th scope="col">Renewal / trial</th>
                  <th scope="col">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {organisations.map(org => (
                  <tr key={org.id}>
                    <td>
                      <Link href={`/owner/organisations/${org.id}`}>{org.name}</Link>
                    </td>
                    <td>
                      {org.primaryContactName || org.primaryContactEmail || "—"}
                    </td>
                    <td>{org.planName}</td>
                    <td>{org.managers}</td>
                    <td>{org.teamMembers}</td>
                    <td>
                      <OwnerStatus
                        value={org.accountStatus}
                        label={ACCOUNT_STATUS_LABELS[org.accountStatus]}
                      />
                    </td>
                    <td>
                      <OwnerStatus
                        value={org.health.level}
                        label={org.health.label}
                      />
                    </td>
                    <td>{org.renewalOrTrialDate || "—"}</td>
                    <td>
                      {org.lastActivityAt
                        ? new Date(org.lastActivityAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="owner-stack" aria-label="Organisation records">
            {organisations.map(org => (
              <article key={org.id} className="owner-stack-card">
                <p className="owner-attention-item__title">
                  <Link href={`/owner/organisations/${org.id}`}>{org.name}</Link>
                </p>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Plan</span>
                  <span>{org.planName}</span>
                </div>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Status</span>
                  <OwnerStatus
                    value={org.accountStatus}
                    label={ACCOUNT_STATUS_LABELS[org.accountStatus]}
                  />
                </div>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Health</span>
                  <OwnerStatus value={org.health.level} label={org.health.label} />
                </div>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Managers</span>
                  <span>{org.managers}</span>
                </div>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Team members</span>
                  <span>{org.teamMembers}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </OwnerShell>
  );
}
