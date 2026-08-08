"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerEmpty } from "@/components/owner/owner-empty";
import { OwnerStatus } from "@/components/owner/owner-status";
import { OwnerConfirmDialog } from "@/components/owner/owner-confirm-dialog";
import { apiJson } from "@/lib/api-client";
import { formatMoneyMinor } from "@/lib/owner/money";
import type {
  CustomerHealth,
  Invoice,
  OrganisationContract,
  OrganisationPaymentMethod,
  OrganisationSubscription,
  OrganisationTrial,
  OrganisationUsageCounts,
  OwnerUserListItem,
  PlatformAuditEvent,
  PurchaseOrder,
  SupportCase,
} from "@/lib/owner/types";
import { ACCOUNT_STATUS_LABELS } from "@/lib/owner/types";

type DetailPayload = {
  organisation: {
    id: string;
    name: string;
    legalName: string | null;
    tradingName: string | null;
    sector: string | null;
    companySize: string | null;
    accountStatus: keyof typeof ACCOUNT_STATUS_LABELS;
    planName: string;
    seatsPurchased: number;
    licenceStartsAt: string | null;
    licenceEndsAt: string | null;
    primaryContactName: string | null;
    primaryContactEmail: string | null;
    billingContactName: string | null;
    billingContactEmail: string | null;
    accountOwnerLabel: string | null;
    createdAt: string;
  };
  usage: OrganisationUsageCounts;
  health: CustomerHealth;
  users: OwnerUserListItem[];
  subscriptions: OrganisationSubscription[];
  invoices: Invoice[];
  paymentMethods: OrganisationPaymentMethod[];
  purchaseOrders: PurchaseOrder[];
  contracts: OrganisationContract[];
  trials: OrganisationTrial[];
  support: SupportCase[];
  audit: PlatformAuditEvent[];
  confidentialityNote: string;
};

const TABS = [
  "Overview",
  "Users",
  "Usage",
  "Commercial",
  "Support",
  "Audit",
  "Settings",
] as const;

type Tab = (typeof TABS)[number];

export default function OwnerOrganisationDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<DetailPayload | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const payload = await apiJson<DetailPayload>(
        `/api/owner/organisations/${params.id}`
      );
      setData(payload);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load organisation.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function updateOrganisation(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await apiJson(`/api/owner/organisations/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update organisation.");
    } finally {
      setSaving(false);
      setConfirmSuspend(false);
    }
  }

  return (
    <OwnerShell title="Organisation" subtitle="Operational and commercial profile.">
      {loading ? <p className="owner-muted">Loading organisation…</p> : null}
      {error ? <p className="owner-error">{error}</p> : null}

      {data ? (
        <>
          <header className="owner-org-header">
            <h1>{data.organisation.name}</h1>
            <div className="owner-org-header__meta">
              <OwnerStatus
                value={data.organisation.accountStatus}
                label={ACCOUNT_STATUS_LABELS[data.organisation.accountStatus]}
              />
              <OwnerStatus value="active" label={data.organisation.planName} />
              <OwnerStatus
                value={data.health.level}
                label={data.health.label}
              />
            </div>
            <p className="owner-muted" style={{ color: "rgba(255,255,255,0.82)" }}>
              Primary contact:{" "}
              {data.organisation.primaryContactName ||
                data.organisation.primaryContactEmail ||
                "Not set"}
            </p>
          </header>

          <p className="owner-muted">{data.confidentialityNote}</p>

          <div className="owner-tabs" role="tablist" aria-label="Organisation sections">
            {TABS.map(item => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                className={tab === item ? "is-active" : undefined}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </div>

          {tab === "Overview" ? (
            <section className="owner-panel">
              <h2 className="owner-panel__title">Organisation details</h2>
              <dl className="owner-metrics" style={{ marginBottom: "1rem" }}>
                <Detail label="Legal / trading name" value={data.organisation.legalName || data.organisation.tradingName || data.organisation.name} />
                <Detail label="Sector" value={data.organisation.sector || "—"} />
                <Detail label="Company size" value={data.organisation.companySize || "—"} />
                <Detail
                  label="Primary contact"
                  value={
                    [data.organisation.primaryContactName, data.organisation.primaryContactEmail]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  }
                />
                <Detail
                  label="Billing contact"
                  value={
                    [data.organisation.billingContactName, data.organisation.billingContactEmail]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  }
                />
                <Detail
                  label="Account owner"
                  value={data.organisation.accountOwnerLabel || "—"}
                />
                <Detail
                  label="Created"
                  value={new Date(data.organisation.createdAt).toLocaleDateString()}
                />
                <Detail
                  label="Account status"
                  value={ACCOUNT_STATUS_LABELS[data.organisation.accountStatus]}
                />
              </dl>

              <h3 className="owner-section__title">Customer health</h3>
              <OwnerStatus value={data.health.level} label={data.health.label} />
              <ul className="owner-health-reasons">
                {data.health.reasons.map(reason => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>

              <h3 className="owner-section__title" style={{ marginTop: "1rem" }}>
                Usage summary
              </h3>
              <div className="owner-metrics">
                <Metric value={data.usage.managersInvited} label="Managers invited" />
                <Metric value={data.usage.managersActivated} label="Managers activated" />
                <Metric value={data.usage.teamMembers} label="Team members" />
                <Metric value={data.usage.activeUsers30d} label="Active users (30d)" />
                <Metric
                  value={data.usage.conversationsCompletedTotal}
                  label="Conversations completed"
                />
                <Metric
                  value={data.usage.preparationsGeneratedTotal}
                  label="Preparations generated"
                />
                <Metric
                  value={
                    data.usage.lastActivityAt
                      ? new Date(data.usage.lastActivityAt).toLocaleDateString()
                      : "—"
                  }
                  label="Last activity"
                />
              </div>
            </section>
          ) : null}

          {tab === "Users" ? (
            <UsersPanel users={data.users} />
          ) : null}

          {tab === "Usage" ? (
            <section className="owner-panel">
              <h2 className="owner-panel__title">Usage</h2>
              <p className="owner-muted">
                Counts and operational metadata only. Conversation contents are not available.
              </p>
              <div className="owner-metrics" style={{ marginTop: "0.75rem" }}>
                <Metric value={data.usage.conversationsCompleted30d} label="Conversations (30d)" />
                <Metric value={data.usage.preparationsGenerated30d} label="Preparations (30d)" />
                <Metric value={data.usage.aiRequests30d} label="AI requests (30d)" />
                <Metric value={data.usage.activeMembers} label="Active members" />
              </div>
            </section>
          ) : null}

          {tab === "Commercial" ? (
            <CommercialPanel
              subscriptions={data.subscriptions}
              invoices={data.invoices}
              paymentMethods={data.paymentMethods}
              purchaseOrders={data.purchaseOrders}
              contracts={data.contracts}
              trials={data.trials}
            />
          ) : null}

          {tab === "Support" ? (
            <section className="owner-panel">
              <h2 className="owner-panel__title">Support</h2>
              {data.support.length === 0 ? (
                <OwnerEmpty
                  title="No support cases"
                  description="Support records for this organisation will appear here."
                />
              ) : (
                <ul className="owner-attention-list">
                  {data.support.map(item => (
                    <li key={item.id} className="owner-attention-item">
                      <p className="owner-attention-item__title">{item.subject}</p>
                      <p className="owner-attention-item__meta">
                        {item.category} · {item.status} · {item.priority}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {tab === "Audit" ? (
            <section className="owner-panel">
              <h2 className="owner-panel__title">Audit</h2>
              {data.audit.length === 0 ? (
                <p className="owner-muted">No owner audit events for this organisation.</p>
              ) : (
                <ul className="owner-attention-list">
                  {data.audit.map(event => (
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
          ) : null}

          {tab === "Settings" ? (
            <section className="owner-panel">
              <h2 className="owner-panel__title">Account settings</h2>
              <div className="owner-filters">
                <button
                  type="button"
                  className="owner-button owner-button--danger"
                  onClick={() => setConfirmSuspend(true)}
                  disabled={saving || data.organisation.accountStatus === "suspended"}
                >
                  Suspend organisation
                </button>
                <button
                  type="button"
                  className="owner-button"
                  disabled={saving || data.organisation.accountStatus === "active"}
                  onClick={() => updateOrganisation({ licenceStatus: "active" })}
                >
                  Reactivate organisation
                </button>
              </div>
            </section>
          ) : null}

          <OwnerConfirmDialog
            open={confirmSuspend}
            title="Suspend organisation?"
            description="This marks the organisation licence as suspended. Members may lose access depending on product rules."
            confirmLabel="Suspend"
            danger
            busy={saving}
            onCancel={() => setConfirmSuspend(false)}
            onConfirm={() => updateOrganisation({ licenceStatus: "suspended" })}
          />
        </>
      ) : null}
    </OwnerShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="owner-metric">
      <p className="owner-metric__label">{label}</p>
      <p className="owner-metric__value" style={{ fontSize: "1rem" }}>
        {value}
      </p>
    </div>
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

function UsersPanel({ users }: { users: OwnerUserListItem[] }) {
  if (users.length === 0) {
    return (
      <OwnerEmpty
        title="No users"
        description="Membership records for this organisation will appear here."
      />
    );
  }

  return (
    <div className="owner-table-wrap">
      <table className="owner-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Last sign in</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.membershipId}>
              <td>{user.fullName || "—"}</td>
              <td>{user.email || "—"}</td>
              <td>{user.role}</td>
              <td>{user.status}</td>
              <td>
                {user.lastActiveAt
                  ? new Date(user.lastActiveAt).toLocaleString()
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommercialPanel({
  subscriptions,
  invoices,
  paymentMethods,
  purchaseOrders,
  contracts,
  trials,
}: {
  subscriptions: OrganisationSubscription[];
  invoices: Invoice[];
  paymentMethods: OrganisationPaymentMethod[];
  purchaseOrders: PurchaseOrder[];
  contracts: OrganisationContract[];
  trials: OrganisationTrial[];
}) {
  return (
    <div className="owner-shell__content">
      <section className="owner-panel">
        <h2 className="owner-panel__title">Subscriptions</h2>
        {subscriptions.length === 0 ? (
          <p className="owner-muted">No subscription records.</p>
        ) : (
          <ul className="owner-attention-list">
            {subscriptions.map(sub => (
              <li key={sub.id} className="owner-attention-item">
                <p className="owner-attention-item__title">
                  {sub.planCode} · {sub.status}
                </p>
                <p className="owner-attention-item__meta">
                  {sub.seats} seats · {sub.billingFrequency}
                  {sub.monthlyValueMinor !== null
                    ? ` · ${formatMoneyMinor(sub.monthlyValueMinor, sub.currency)} / month`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="owner-panel">
        <h2 className="owner-panel__title">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="owner-muted">No invoices.</p>
        ) : (
          <ul className="owner-attention-list">
            {invoices.map(inv => (
              <li key={inv.id} className="owner-attention-item">
                <p className="owner-attention-item__title">
                  {inv.invoiceNumber} · {formatMoneyMinor(inv.grossMinor, inv.currency)}
                </p>
                <p className="owner-attention-item__meta">
                  {inv.status}
                  {inv.documentReference ? " · document reference recorded" : " · no PDF available"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="owner-panel">
        <h2 className="owner-panel__title">Payment methods</h2>
        {paymentMethods.length === 0 ? (
          <p className="owner-muted">No payment methods recorded.</p>
        ) : (
          <ul className="owner-attention-list">
            {paymentMethods.map(method => (
              <li key={method.id} className="owner-attention-item">
                <p className="owner-attention-item__title">{method.maskedDescriptor}</p>
                <p className="owner-attention-item__meta">
                  {method.methodType} · {method.status}
                  {method.isDefault ? " · default" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="owner-panel">
        <h2 className="owner-panel__title">Purchase orders</h2>
        {purchaseOrders.length === 0 ? (
          <p className="owner-muted">No purchase orders.</p>
        ) : (
          <ul className="owner-attention-list">
            {purchaseOrders.map(po => (
              <li key={po.id} className="owner-attention-item">
                <p className="owner-attention-item__title">{po.poNumber}</p>
                <p className="owner-attention-item__meta">
                  Remaining {formatMoneyMinor(po.remainingBalanceMinor, po.currency)} · {po.status}
                  {po.warnings.length ? ` · ${po.warnings.join("; ")}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="owner-panel">
        <h2 className="owner-panel__title">Contracts</h2>
        {contracts.length === 0 ? (
          <p className="owner-muted">No contracts.</p>
        ) : (
          <ul className="owner-attention-list">
            {contracts.map(contract => (
              <li key={contract.id} className="owner-attention-item">
                <p className="owner-attention-item__title">{contract.name}</p>
                <p className="owner-attention-item__meta">
                  {contract.status}
                  {contract.endsAt ? ` · ends ${contract.endsAt}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="owner-panel">
        <h2 className="owner-panel__title">Trials</h2>
        {trials.length === 0 ? (
          <p className="owner-muted">No trial record.</p>
        ) : (
          <ul className="owner-attention-list">
            {trials.map(trial => (
              <li key={trial.id} className="owner-attention-item">
                <p className="owner-attention-item__title">
                  {trial.trialStartsAt} → {trial.trialEndsAt}
                </p>
                <p className="owner-attention-item__meta">
                  {trial.conversionStatus.replaceAll("_", " ")} · {trial.durationDays} days
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
