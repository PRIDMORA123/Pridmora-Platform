"use client";

import { FormEvent, useEffect, useState } from "react";
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

type OrganisationInvitationRow = {
  id: string;
  organisationId: string;
  email: string;
  fullName: string | null;
  jobTitle: string | null;
  role: "oversight" | "practitioner";
  professionalRole: "manager" | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

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
  const [invitations, setInvitations] = useState<OrganisationInvitationRow[]>(
    []
  );
  const [leadInvitations, setLeadInvitations] = useState<
    OrganisationInvitationRow[]
  >([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showLeadInviteForm, setShowLeadInviteForm] = useState(false);
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteJobTitle, setInviteJobTitle] = useState("");
  const [leadInviteFullName, setLeadInviteFullName] = useState("");
  const [leadInviteEmail, setLeadInviteEmail] = useState("");
  const [leadInviteJobTitle, setLeadInviteJobTitle] = useState("");
  const [inviting, setInviting] = useState(false);
  const [invitingLead, setInvitingLead] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  async function loadInvitations() {
    try {
      const payload = await apiJson<{
        invitations: OrganisationInvitationRow[];
        leadInvitations?: OrganisationInvitationRow[];
      }>(`/api/owner/organisations/${params.id}/invitations`);
      setInvitations(payload.invitations);
      setLeadInvitations(payload.leadInvitations ?? []);
    } catch {
      // Detail can still render without invitation list.
      setInvitations([]);
      setLeadInvitations([]);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const payload = await apiJson<DetailPayload>(
        `/api/owner/organisations/${params.id}`
      );
      setData(payload);
      setError("");
      await loadInvitations();
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

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    setInviting(true);
    setInviteMessage("");
    setError("");
    try {
      await apiJson(`/api/owner/organisations/${params.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({
          inviteKind: "manager",
          fullName: inviteFullName,
          email: inviteEmail,
          jobTitle: inviteJobTitle.trim() || null,
        }),
      });
      setInviteMessage("Manager invitation sent.");
      setInviteFullName("");
      setInviteEmail("");
      setInviteJobTitle("");
      setShowInviteForm(false);
      await loadInvitations();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to invite manager.");
    } finally {
      setInviting(false);
    }
  }

  async function submitLeadInvite(event: FormEvent) {
    event.preventDefault();
    setInvitingLead(true);
    setInviteMessage("");
    setError("");
    try {
      await apiJson(`/api/owner/organisations/${params.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({
          inviteKind: "lead",
          fullName: leadInviteFullName,
          email: leadInviteEmail,
          jobTitle: leadInviteJobTitle.trim() || null,
        }),
      });
      setInviteMessage("Organisation Lead invitation sent.");
      setLeadInviteFullName("");
      setLeadInviteEmail("");
      setLeadInviteJobTitle("");
      setShowLeadInviteForm(false);
      await loadInvitations();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to invite lead.");
    } finally {
      setInvitingLead(false);
    }
  }

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
            <div className="owner-filters" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="owner-button"
                onClick={() => {
                  setShowLeadInviteForm(true);
                  setShowInviteForm(false);
                  setTab("Users");
                }}
              >
                Invite Lead
              </button>
              <button
                type="button"
                className="owner-button"
                onClick={() => {
                  setShowInviteForm(true);
                  setShowLeadInviteForm(false);
                  setTab("Users");
                }}
              >
                Invite manager
              </button>
              <span className="owner-muted" style={{ color: "rgba(255,255,255,0.82)" }}>
                {data.organisation.seatsPurchased} seats · Managers use
                practitioner seats · Leads do not
              </span>
            </div>
          </header>

          <p className="owner-muted">{data.confidentialityNote}</p>
          {inviteMessage ? (
            <p className="owner-muted" role="status">
              {inviteMessage}
            </p>
          ) : null}

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
            <>
              <section className="owner-panel" style={{ marginBottom: "1rem" }}>
                <div
                  className="owner-filters"
                  style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}
                >
                  <h2 className="owner-panel__title" style={{ margin: 0 }}>
                    Organisation Leads
                  </h2>
                  <button
                    type="button"
                    className="owner-button"
                    onClick={() => {
                      setShowLeadInviteForm(value => !value);
                      setShowInviteForm(false);
                    }}
                  >
                    {showLeadInviteForm ? "Close invite form" : "Invite Lead"}
                  </button>
                </div>
                <p className="owner-muted">
                  Invite an Organisation Lead to view privacy-safe organisation
                  development intelligence and oversight. Leads do not receive
                  access to private Manager development content.
                </p>

                {showLeadInviteForm ? (
                  <form
                    onSubmit={event => {
                      void submitLeadInvite(event);
                    }}
                    style={{ marginTop: "1rem" }}
                  >
                    <div className="owner-filters" style={{ alignItems: "stretch" }}>
                      <div className="owner-field" style={{ minWidth: "14rem", flex: 1 }}>
                        <label htmlFor="owner-invite-lead-name">Full name</label>
                        <input
                          id="owner-invite-lead-name"
                          required
                          value={leadInviteFullName}
                          onChange={event =>
                            setLeadInviteFullName(event.target.value)
                          }
                          autoComplete="name"
                        />
                      </div>
                      <div className="owner-field" style={{ minWidth: "14rem", flex: 1 }}>
                        <label htmlFor="owner-invite-lead-email">Email</label>
                        <input
                          id="owner-invite-lead-email"
                          type="email"
                          required
                          value={leadInviteEmail}
                          onChange={event =>
                            setLeadInviteEmail(event.target.value)
                          }
                          autoComplete="email"
                        />
                      </div>
                      <div className="owner-field" style={{ minWidth: "12rem", flex: 1 }}>
                        <label htmlFor="owner-invite-lead-title">
                          Job title (optional)
                        </label>
                        <input
                          id="owner-invite-lead-title"
                          value={leadInviteJobTitle}
                          onChange={event =>
                            setLeadInviteJobTitle(event.target.value)
                          }
                          autoComplete="organization-title"
                        />
                      </div>
                    </div>
                    <div className="owner-filters" style={{ marginTop: "0.75rem" }}>
                      <button
                        type="submit"
                        className="owner-button"
                        disabled={invitingLead}
                      >
                        {invitingLead
                          ? "Sending invitation…"
                          : "Send Lead invitation"}
                      </button>
                    </div>
                  </form>
                ) : null}

                <h3 className="owner-section__title" style={{ marginTop: "1.25rem" }}>
                  Lead invitations
                </h3>
                <LeadInvitationsPanel invitations={leadInvitations} />
              </section>

              <section className="owner-panel" style={{ marginBottom: "1rem" }}>
                <div
                  className="owner-filters"
                  style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}
                >
                  <h2 className="owner-panel__title" style={{ margin: 0 }}>
                    Managers
                  </h2>
                  <button
                    type="button"
                    className="owner-button"
                    onClick={() => {
                      setShowInviteForm(value => !value);
                      setShowLeadInviteForm(false);
                    }}
                  >
                    {showInviteForm ? "Close invite form" : "Invite manager"}
                  </button>
                </div>
                <p className="owner-muted">
                  Invite a Manager for this organisation. They join as a
                  practitioner with professional role Manager — not an organisation
                  owner, Organisation Lead, or Owner Console user.
                </p>

                {showInviteForm ? (
                  <form
                    onSubmit={event => {
                      void submitInvite(event);
                    }}
                    style={{ marginTop: "1rem" }}
                  >
                    <div className="owner-filters" style={{ alignItems: "stretch" }}>
                      <div className="owner-field" style={{ minWidth: "14rem", flex: 1 }}>
                        <label htmlFor="owner-invite-manager-name">Full name</label>
                        <input
                          id="owner-invite-manager-name"
                          required
                          value={inviteFullName}
                          onChange={event => setInviteFullName(event.target.value)}
                          autoComplete="name"
                        />
                      </div>
                      <div className="owner-field" style={{ minWidth: "14rem", flex: 1 }}>
                        <label htmlFor="owner-invite-manager-email">Email</label>
                        <input
                          id="owner-invite-manager-email"
                          type="email"
                          required
                          value={inviteEmail}
                          onChange={event => setInviteEmail(event.target.value)}
                          autoComplete="email"
                        />
                      </div>
                      <div className="owner-field" style={{ minWidth: "12rem", flex: 1 }}>
                        <label htmlFor="owner-invite-manager-title">
                          Job title (optional)
                        </label>
                        <input
                          id="owner-invite-manager-title"
                          value={inviteJobTitle}
                          onChange={event => setInviteJobTitle(event.target.value)}
                          autoComplete="organization-title"
                        />
                      </div>
                    </div>
                    <div className="owner-filters" style={{ marginTop: "0.75rem" }}>
                      <button
                        type="submit"
                        className="owner-button"
                        disabled={inviting}
                      >
                        {inviting ? "Sending invitation…" : "Send invitation"}
                      </button>
                    </div>
                  </form>
                ) : null}

                <h3 className="owner-section__title" style={{ marginTop: "1.25rem" }}>
                  Manager invitations
                </h3>
                <ManagerInvitationsPanel invitations={invitations} />
              </section>
              <UsersPanel users={data.users} />
            </>
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

function invitationDisplayStatus(invitation: OrganisationInvitationRow): string {
  if (
    invitation.status === "pending" &&
    new Date(invitation.expiresAt).getTime() <= Date.now()
  ) {
    return "expired";
  }
  if (invitation.status === "accepted") return "accepted / active";
  return invitation.status;
}

function InvitationTable({
  invitations,
}: {
  invitations: OrganisationInvitationRow[];
}) {
  return (
    <div className="owner-table-wrap">
      <table className="owner-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Job title</th>
            <th scope="col">Status</th>
            <th scope="col">Expires</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map(invitation => (
            <tr key={invitation.id}>
              <td>{invitation.fullName || "—"}</td>
              <td>{invitation.email}</td>
              <td>{invitation.jobTitle || "—"}</td>
              <td>{invitationDisplayStatus(invitation)}</td>
              <td>{new Date(invitation.expiresAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadInvitationsPanel({
  invitations,
}: {
  invitations: OrganisationInvitationRow[];
}) {
  if (invitations.length === 0) {
    return (
      <OwnerEmpty
        title="No Lead invitations yet"
        description="Use Invite Lead to send an Organisation Lead invitation. Leads view privacy-safe organisation intelligence only."
      />
    );
  }

  return <InvitationTable invitations={invitations} />;
}

function ManagerInvitationsPanel({
  invitations,
}: {
  invitations: OrganisationInvitationRow[];
}) {
  if (invitations.length === 0) {
    return (
      <OwnerEmpty
        title="No manager invitations yet"
        description="Use Invite manager to send the first Manager invitation for this organisation."
      />
    );
  }

  return <InvitationTable invitations={invitations} />;
}

function UsersPanel({ users }: { users: OwnerUserListItem[] }) {
  if (users.length === 0) {
    return (
      <OwnerEmpty
        title="No active memberships"
        description="Accepted Leads and Managers appear here after they complete account setup."
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
