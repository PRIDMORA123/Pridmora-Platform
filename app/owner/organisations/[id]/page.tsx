"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerEmpty } from "@/components/owner/owner-empty";
import { OwnerStatus } from "@/components/owner/owner-status";
import { OwnerConfirmDialog } from "@/components/owner/owner-confirm-dialog";
import { apiJson } from "@/lib/api-client";
import { formatMoneyMinor } from "@/lib/owner/money";
import {
  CONVERT_TRIAL_CONFIRMATION,
  ownerOrganisationSettingsActions,
} from "@/lib/owner/convert-trial-to-active";
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
import type { OrganisationDeletionPreflight } from "@/lib/owner/organisation-deletion-preflight";
import type { OrganisationDeletionRunSummary } from "@/lib/owner/organisation-deletion-initiation";
import type { CommercialRetentionState } from "@/lib/owner/organisation-commercial-retention";
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
  "Data lifecycle",
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
  const [confirmConvertTrial, setConfirmConvertTrial] = useState(false);
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
  const [preflight, setPreflight] = useState<OrganisationDeletionPreflight | null>(
    null
  );
  const [preflightError, setPreflightError] = useState("");
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [openRun, setOpenRun] = useState<OrganisationDeletionRunSummary | null>(
    null
  );
  const [confirmationName, setConfirmationName] = useState("");
  const [instructionReference, setInstructionReference] = useState("");
  const [freezeAcknowledged, setFreezeAcknowledged] = useState(false);
  const [initiating, setInitiating] = useState(false);
  const [initiationError, setInitiationError] = useState("");
  const [initiationSuccess, setInitiationSuccess] = useState<{
    deletionRunId: string;
    requestedAt: string;
    runStatus: string;
    stage: string;
    alreadyStarted: boolean;
  } | null>(null);
  const [commercialRetention, setCommercialRetention] =
    useState<CommercialRetentionState | null>(null);
  const [commercialError, setCommercialError] = useState("");
  const [commercialCopyAcknowledged, setCommercialCopyAcknowledged] =
    useState(false);
  const [copyingCommercial, setCopyingCommercial] = useState(false);
  const [commercialCopySuccess, setCommercialCopySuccess] = useState(false);

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

  async function loadPreflight() {
    setPreflightLoading(true);
    try {
      const payload = await apiJson<OrganisationDeletionPreflight>(
        `/api/owner/organisations/${params.id}/deletion-preflight`
      );
      setPreflight(payload);
      setPreflightError("");
    } catch (err) {
      setPreflight(null);
      setPreflightError(
        err instanceof Error ? err.message : "Unable to load deletion preflight."
      );
    } finally {
      setPreflightLoading(false);
    }

    try {
      const runState = await apiJson<{
        openRun: OrganisationDeletionRunSummary | null;
      }>(`/api/owner/organisations/${params.id}/deletion-initiation`);
      setOpenRun(runState.openRun);
    } catch {
      setOpenRun(null);
    }

    try {
      const retention = await apiJson<CommercialRetentionState>(
        `/api/owner/organisations/${params.id}/commercial-retention`
      );
      setCommercialRetention(retention);
      setCommercialError("");
      if (retention.alreadyCopied) setCommercialCopySuccess(true);
    } catch (err) {
      setCommercialRetention(null);
      setCommercialError(
        err instanceof Error
          ? err.message
          : "Unable to load commercial retention status."
      );
    }
  }

  useEffect(() => {
    if (tab !== "Data lifecycle") return;
    void loadPreflight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, params.id]);

  async function submitClosureInitiation(event: FormEvent) {
    event.preventDefault();
    setInitiating(true);
    setInitiationError("");
    try {
      const payload = await apiJson<{
        deletionRunId: string;
        requestedAt: string;
        runStatus: string;
        stage: string;
        alreadyStarted: boolean;
      }>(`/api/owner/organisations/${params.id}/deletion-initiation`, {
        method: "POST",
        body: JSON.stringify({
          confirmationName,
          instructionReference,
          freezeAcknowledged,
        }),
      });
      setInitiationSuccess(payload);
      setConfirmationName("");
      setInstructionReference("");
      setFreezeAcknowledged(false);
      await load();
      await loadPreflight();
    } catch (err) {
      setInitiationError(
        err instanceof Error
          ? err.message
          : "Unable to authorise organisation closure."
      );
    } finally {
      setInitiating(false);
    }
  }

  async function submitCommercialRetention(event: FormEvent) {
    event.preventDefault();
    if (!commercialRetention?.deletionRunId) return;
    setCopyingCommercial(true);
    setCommercialError("");
    try {
      const payload = await apiJson<CommercialRetentionState & { ok?: boolean }>(
        `/api/owner/organisations/${params.id}/commercial-retention`,
        {
          method: "POST",
          body: JSON.stringify({
            deletionRunId: commercialRetention.deletionRunId,
            commercialCopyAcknowledged: true,
          }),
        }
      );
      setCommercialRetention({
        organisationId: payload.organisationId,
        organisationStatus: payload.organisationStatus,
        deletionRunId: payload.deletionRunId,
        runStatus: payload.runStatus,
        stage: payload.stage,
        verificationStatus: payload.verificationStatus,
        sources: payload.sources,
        retainedTotal: payload.retainedTotal,
        copyAvailable: false,
        alreadyCopied: true,
        purgeReadiness: payload.purgeReadiness,
        permanentDeletionOccurred: false,
      });
      setCommercialCopySuccess(true);
      setCommercialCopyAcknowledged(false);
      await loadPreflight();
    } catch (err) {
      setCommercialError(
        err instanceof Error
          ? err.message
          : "Unable to prepare the retained commercial record."
      );
    } finally {
      setCopyingCommercial(false);
    }
  }

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
      setConfirmConvertTrial(false);
    }
  }

  const settingsActions = useMemo(
    () =>
      data
        ? ownerOrganisationSettingsActions(data.organisation.accountStatus)
        : null,
    [data]
  );

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

          {tab === "Data lifecycle" ? (
            <section className="owner-panel">
              <h2 className="owner-panel__title">Deletion preflight</h2>
              <p className="owner-muted">
                Read-only inventory for Platform Owner closure. This inventory
                does not delete data. Permanent erasure is not available here.
              </p>
              {preflightLoading ? (
                <p className="owner-muted">Loading preflight…</p>
              ) : null}
              {preflightError ? (
                <p className="owner-muted" role="alert">
                  {preflightError}
                </p>
              ) : null}
              {preflight ? (
                <>
                  <dl className="owner-metrics" style={{ margin: "1rem 0" }}>
                    <Detail
                      label="Eligibility"
                      value={preflight.eligibility.replaceAll("_", " ")}
                    />
                    <Detail
                      label="Organisation"
                      value={
                        preflight.organisation
                          ? `${preflight.organisation.name} (${preflight.organisation.organisationType})`
                          : "Not found"
                      }
                    />
                    <Detail
                      label="Memberships"
                      value={String(preflight.sharedUsers.membershipCount)}
                    />
                    <Detail
                      label="Sole-tenant users"
                      value={String(preflight.sharedUsers.soleTenantUserCount)}
                    />
                    <Detail
                      label="Shared users"
                      value={String(preflight.sharedUsers.sharedTenantUserCount)}
                    />
                    <Detail
                      label="Platform Owner members"
                      value={String(preflight.sharedUsers.platformOwnerMemberCount)}
                    />
                  </dl>
                  <h3 className="owner-panel__title">Blocking / review reasons</h3>
                  {preflight.reasons.length > 0 ? (
                    <ul className="owner-muted">
                      {preflight.reasons.map(reason => (
                        <li key={reason.code}>
                          {reason.severity}: {reason.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="owner-muted">No blocking or review reasons.</p>
                  )}
                  <h3 className="owner-panel__title">Tenant data inventory</h3>
                  <ul className="owner-muted">
                    {preflight.inventory.map(item => (
                      <li key={item.key}>
                        {item.table}: {item.counted ? item.count : "uncounted"} (
                        {item.disposition.replaceAll("_", " ")})
                      </li>
                    ))}
                  </ul>
                  <h3 className="owner-panel__title">Storage</h3>
                  <p className="owner-muted">
                    Bucket {preflight.storage.bucket}:{" "}
                    {preflight.storage.authoritativePathCount} authoritative paths,
                    prefix {preflight.storage.prefixListed ? "listed" : "unverified"}{" "}
                    ({preflight.storage.ownership.replaceAll("_", " ")}). No objects
                    were deleted.
                  </p>
                  <h3 className="owner-panel__title">Commercial records</h3>
                  <ul className="owner-muted">
                    {preflight.commercial.map(item => (
                      <li key={item.key}>
                        {item.table}: {item.counted ? item.count : "uncounted"} (retain
                        later, not copied)
                      </li>
                    ))}
                  </ul>
                  <h3 className="owner-panel__title">Residual / review items</h3>
                  <ul className="owner-muted">
                    {preflight.residuals.map(item => (
                      <li key={item.location}>
                        {item.location}: {item.attributedCount} ({item.attribution})
                      </li>
                    ))}
                  </ul>
                  {preflight.knownLimitations.length > 0 ? (
                    <>
                      <h3 className="owner-panel__title">Known limitations</h3>
                      <ul className="owner-muted">
                        {preflight.knownLimitations.map(item => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <p className="owner-muted">{preflight.confidentialityNote}</p>
                  <ClosureInitiationPanel
                    organisationName={preflight.organisation?.name ?? ""}
                    organisationStatus={preflight.organisation?.status ?? ""}
                    eligibility={preflight.eligibility}
                    openRun={openRun}
                    confirmationName={confirmationName}
                    instructionReference={instructionReference}
                    freezeAcknowledged={freezeAcknowledged}
                    initiating={initiating}
                    initiationError={initiationError}
                    initiationSuccess={initiationSuccess}
                    onConfirmationNameChange={setConfirmationName}
                    onInstructionReferenceChange={setInstructionReference}
                    onFreezeAcknowledgedChange={setFreezeAcknowledged}
                    onSubmit={submitClosureInitiation}
                  />
                  <CommercialRetentionPanel
                    organisationStatus={
                      commercialRetention?.organisationStatus ??
                      preflight.organisation?.status ??
                      ""
                    }
                    retention={commercialRetention}
                    error={commercialError}
                    acknowledged={commercialCopyAcknowledged}
                    copying={copyingCommercial}
                    copySucceeded={commercialCopySuccess}
                    onAcknowledgedChange={setCommercialCopyAcknowledged}
                    onSubmit={submitCommercialRetention}
                  />
                </>
              ) : null}
            </section>
          ) : null}

          {tab === "Settings" ? (
            <section className="owner-panel">
              <h2 className="owner-panel__title">Account settings</h2>
              <div className="owner-filters">
                {settingsActions?.showConvertTrial ? (
                  <button
                    type="button"
                    className="owner-button"
                    disabled={saving}
                    onClick={() => setConfirmConvertTrial(true)}
                  >
                    Convert trial to active
                  </button>
                ) : null}
                {settingsActions?.showSuspend ? (
                  <button
                    type="button"
                    className="owner-button owner-button--danger"
                    onClick={() => setConfirmSuspend(true)}
                    disabled={saving}
                  >
                    Suspend organisation
                  </button>
                ) : null}
                {settingsActions?.showReactivate ? (
                  <button
                    type="button"
                    className="owner-button"
                    disabled={saving}
                    onClick={() => updateOrganisation({ licenceStatus: "active" })}
                  >
                    Reactivate organisation
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <OwnerConfirmDialog
            open={confirmConvertTrial}
            title="Convert trial to active?"
            description={CONVERT_TRIAL_CONFIRMATION}
            confirmLabel="Convert trial to active"
            busy={saving}
            onCancel={() => setConfirmConvertTrial(false)}
            onConfirm={() =>
              updateOrganisation({ action: "convert_trial_to_active" })
            }
          />

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

function ClosureInitiationPanel(props: {
  organisationName: string;
  organisationStatus: string;
  eligibility: string;
  openRun: OrganisationDeletionRunSummary | null;
  confirmationName: string;
  instructionReference: string;
  freezeAcknowledged: boolean;
  initiating: boolean;
  initiationError: string;
  initiationSuccess: {
    deletionRunId: string;
    requestedAt: string;
    runStatus: string;
    stage: string;
    alreadyStarted: boolean;
  } | null;
  onConfirmationNameChange: (value: string) => void;
  onInstructionReferenceChange: (value: string) => void;
  onFreezeAcknowledgedChange: (value: boolean) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const run = props.openRun;
  const frozen =
    Boolean(run) ||
    props.organisationStatus === "pending_closure" ||
    Boolean(props.initiationSuccess);
  const nameMatches =
    props.organisationName.trim() === props.confirmationName.trim();
  const canSubmit =
    props.eligibility === "eligible" &&
    !frozen &&
    nameMatches &&
    props.instructionReference.trim().length > 0 &&
    props.freezeAcknowledged &&
    !props.initiating;

  return (
    <section
      className="owner-panel"
      style={{ marginTop: "1.5rem", borderColor: "var(--owner-danger, #8a1c1c)" }}
    >
      <h2 className="owner-panel__title">Authorise closure and freeze</h2>
      {frozen ? (
        <>
          <p className="owner-muted">
            Customer access is frozen. Permanent erasure of tenant data has not
            occurred. There is no continue action on this screen.
          </p>
          <dl className="owner-metrics" style={{ margin: "1rem 0" }}>
            <Detail label="Organisation status" value="pending_closure" />
            <Detail
              label="Deletion run ID"
              value={
                props.initiationSuccess?.deletionRunId ?? run?.id ?? "Unavailable"
              }
            />
            <Detail
              label="Authorised at"
              value={
                props.initiationSuccess?.requestedAt ??
                run?.requestedAt ??
                "Unavailable"
              }
            />
            <Detail
              label="Run stage"
              value={(
                props.initiationSuccess?.stage ??
                run?.stage ??
                "access_frozen"
              ).replaceAll("_", " ")}
            />
            <Detail
              label="Run status"
              value={(
                props.initiationSuccess?.runStatus ??
                run?.status ??
                "frozen"
              ).replaceAll("_", " ")}
            />
          </dl>
        </>
      ) : props.eligibility === "eligible" ? (
        <>
          <p className="owner-muted">
            This step freezes customer access and creates the deletion case. It
            does not erase tenant data. Type the organisation name exactly, add
            an instruction reference, and confirm the freeze.
          </p>
          <form onSubmit={props.onSubmit}>
            <div className="owner-field" style={{ marginTop: "1rem" }}>
              <label htmlFor="closure-confirmation-name">
                Type the organisation name exactly
              </label>
              <input
                id="closure-confirmation-name"
                value={props.confirmationName}
                onChange={event =>
                  props.onConfirmationNameChange(event.target.value)
                }
                autoComplete="off"
                disabled={props.initiating}
              />
            </div>
            <div className="owner-field" style={{ marginTop: "1rem" }}>
              <label htmlFor="closure-instruction">
                Instruction / authority reference
              </label>
              <input
                id="closure-instruction"
                value={props.instructionReference}
                onChange={event =>
                  props.onInstructionReferenceChange(event.target.value)
                }
                maxLength={200}
                autoComplete="off"
                disabled={props.initiating}
              />
            </div>
            <label className="owner-muted" style={{ display: "block", margin: "1rem 0" }}>
              <input
                type="checkbox"
                checked={props.freezeAcknowledged}
                onChange={event =>
                  props.onFreezeAcknowledgedChange(event.target.checked)
                }
                disabled={props.initiating}
              />{" "}
              I understand this immediately freezes organisation access and
              creates the deletion case. Tenant data is not erased yet.
            </label>
            {props.initiationError ? (
              <p className="owner-muted" role="alert">
                {props.initiationError}
              </p>
            ) : null}
            <button
              type="submit"
              className="owner-button owner-button--danger"
              disabled={!canSubmit}
            >
              Authorise closure and freeze organisation
            </button>
          </form>
        </>
      ) : (
        <p className="owner-muted">
          Closure cannot start while preflight is {props.eligibility.replaceAll("_", " ")}.
        </p>
      )}
    </section>
  );
}

function CommercialRetentionPanel(props: {
  organisationStatus: string;
  retention: CommercialRetentionState | null;
  error: string;
  acknowledged: boolean;
  copying: boolean;
  copySucceeded: boolean;
  onAcknowledgedChange: (value: boolean) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const frozen = props.organisationStatus === "pending_closure";
  if (!frozen) return null;

  const retention = props.retention;
  const copied = Boolean(retention?.alreadyCopied || props.copySucceeded);
  const canSubmit =
    Boolean(retention?.copyAvailable) &&
    props.acknowledged &&
    !props.copying &&
    !copied;

  return (
    <section className="owner-panel" style={{ marginTop: "1.5rem" }}>
      <h2 className="owner-panel__title">Commercial retention</h2>
      <p className="owner-muted">
        This stage copies approved commercial/accounting metadata only. It does
        not erase tenant data, storage, or Auth users. There is no destructive
        action on this screen.
      </p>
      {retention ? (
        <>
          <dl className="owner-metrics" style={{ margin: "1rem 0" }}>
            <Detail
              label="Organisation status"
              value={(retention.organisationStatus ?? "unknown").replaceAll(
                "_",
                " "
              )}
            />
            <Detail
              label="Run status"
              value={(retention.runStatus ?? "unknown").replaceAll("_", " ")}
            />
            <Detail
              label="Run stage"
              value={(retention.stage ?? "unknown").replaceAll("_", " ")}
            />
            <Detail
              label="Commercial copy"
              value={copied ? "completed and verified" : "not completed"}
            />
            <Detail
              label="Verification"
              value={(retention.verificationStatus ?? "not_started").replaceAll(
                "_",
                " "
              )}
            />
            <Detail
              label="Future purge readiness"
              value={retention.purgeReadiness.result.replaceAll("_", " ")}
            />
            <Detail
              label="Retained records"
              value={String(retention.retainedTotal)}
            />
          </dl>
          <h3 className="owner-panel__title">Source and retained counts</h3>
          <ul className="owner-muted">
            {retention.sources.map(item => (
              <li key={item.recordType}>
                {item.table}: {item.sourceCount} source, {item.retainedCount}{" "}
                retained
              </li>
            ))}
          </ul>
          {retention.purgeReadiness.reasons.length > 0 ? (
            <>
              <h3 className="owner-panel__title">Blocking / review reasons</h3>
              <ul className="owner-muted">
                {retention.purgeReadiness.reasons.map(reason => (
                  <li key={reason.code}>
                    {reason.severity}: {reason.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {copied ? (
            <ul className="owner-muted">
              <li>Organisation remains frozen (pending closure).</li>
              <li>Tenant data still exists.</li>
              <li>No storage has been deleted.</li>
              <li>Permanent erasure of tenant data has not occurred.</li>
              <li>Commercial retention has completed.</li>
              <li>
                Future purge readiness:{" "}
                {retention.purgeReadiness.result.replaceAll("_", " ")} (not
                execution).
              </li>
              <li>There is no destructive action on this screen.</li>
            </ul>
          ) : retention.copyAvailable ? (
            <form onSubmit={props.onSubmit}>
              <label
                className="owner-muted"
                style={{ display: "block", margin: "1rem 0" }}
              >
                <input
                  type="checkbox"
                  checked={props.acknowledged}
                  onChange={event =>
                    props.onAcknowledgedChange(event.target.checked)
                  }
                  disabled={props.copying}
                />{" "}
                I understand this copies commercial/accounting metadata only and
                does not delete tenant data, storage, or Auth users.
              </label>
              {props.error ? (
                <p className="owner-muted" role="alert">
                  {props.error}
                </p>
              ) : null}
              <button
                type="submit"
                className="owner-button"
                disabled={!canSubmit}
              >
                Prepare retained commercial record
              </button>
            </form>
          ) : (
            <p className="owner-muted">
              Commercial retention copy is not available for this run state.
            </p>
          )}
        </>
      ) : props.error ? (
        <p className="owner-muted" role="alert">
          {props.error}
        </p>
      ) : (
        <p className="owner-muted">Loading commercial retention status…</p>
      )}
    </section>
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
