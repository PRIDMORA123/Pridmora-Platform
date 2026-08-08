"use client";

import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerEmpty } from "@/components/owner/owner-empty";
import { OwnerStatus } from "@/components/owner/owner-status";
import { apiJson } from "@/lib/api-client";
import { formatMoneyMinor } from "@/lib/owner/money";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "invoices", label: "Invoices" },
  { id: "payment_methods", label: "Payment Methods" },
  { id: "purchase_orders", label: "Purchase Orders" },
  { id: "contracts", label: "Contracts" },
  { id: "trials", label: "Trials" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function OwnerCommercialPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ tab });
        if (tab === "invoices") {
          if (status !== "all") params.set("status", status);
          if (overdueOnly) params.set("overdue", "1");
        }
        const payload = await apiJson<Record<string, unknown>>(
          `/api/owner/commercial?${params.toString()}`
        );
        if (!active) return;
        setData(payload);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load commercial data.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tab, status, overdueOnly]);

  const overview = data?.overview as
    | {
        mrrMinor: number | null;
        arrMinor: number | null;
        activeSubscriptions: number;
        trialAccounts: number;
        trialsConverting: number;
        outstandingInvoices: number;
        overdueValueMinor: number | null;
        renewals30: number;
        renewals60: number;
        renewals90: number;
        valuesAvailable: boolean;
      }
    | undefined;

  return (
    <OwnerShell
      title="Commercial"
      subtitle="Subscriptions, invoices, payment methods, purchase orders, contracts and trials."
    >
      <div className="owner-tabs" role="tablist" aria-label="Commercial sections">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "is-active" : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <p className="owner-muted">Loading commercial data…</p> : null}
      {error ? <p className="owner-error">{error}</p> : null}

      {!loading && data && tab === "overview" && overview ? (
        <section className="owner-section">
          <div className="owner-metrics">
            <Metric
              value={
                overview.valuesAvailable
                  ? formatMoneyMinor(overview.mrrMinor)
                  : "Not available"
              }
              label="MRR"
            />
            <Metric
              value={
                overview.valuesAvailable
                  ? formatMoneyMinor(overview.arrMinor)
                  : "Not available"
              }
              label="ARR"
            />
            <Metric value={overview.activeSubscriptions} label="Active subscriptions" />
            <Metric value={overview.trialAccounts} label="Trial accounts" />
            <Metric value={overview.trialsConverting} label="Trials converting" />
            <Metric value={overview.outstandingInvoices} label="Outstanding invoices" />
            <Metric
              value={
                overview.overdueValueMinor === null
                  ? "Not available"
                  : formatMoneyMinor(overview.overdueValueMinor)
              }
              label="Overdue value"
            />
            <Metric value={overview.renewals30} label="Renewals within 30 days" />
            <Metric value={overview.renewals60} label="Renewals within 60 days" />
            <Metric value={overview.renewals90} label="Renewals within 90 days" />
          </div>
          {!overview.valuesAvailable ? (
            <p className="owner-muted">
              Commercial values are not yet available. Enter subscription amounts to
              calculate MRR/ARR — figures are never invented.
            </p>
          ) : null}
        </section>
      ) : null}

      {!loading && data && tab === "subscriptions" ? (
        <RecordsTable
          emptyTitle="No subscriptions"
          emptyDescription="Subscription records will appear when created for organisations."
          columns={[
            "Organisation",
            "Plan",
            "Seats",
            "Billing",
            "Start",
            "Renewal",
            "Status",
            "Value",
          ]}
          rows={((data.subscriptions as Array<Record<string, unknown>>) ?? []).map(
            row => [
              String(row.organisationName ?? ""),
              String(row.planCode ?? ""),
              String(row.seats ?? ""),
              String(row.billingFrequency ?? ""),
              String(row.startsAt ?? "—"),
              String(row.renewalAt ?? "—"),
              String(row.status ?? ""),
              row.monthlyValueMinor == null && row.annualValueMinor == null
                ? "Not available"
                : formatMoneyMinor(
                    (row.monthlyValueMinor as number | null) ??
                      (row.annualValueMinor as number | null),
                    String(row.currency ?? "GBP")
                  ),
            ]
          )}
        />
      ) : null}

      {!loading && data && tab === "invoices" ? (
        <>
          <div className="owner-filters">
            <div className="owner-field">
              <label htmlFor="invoice-status">Status</label>
              <select
                id="invoice-status"
                value={status}
                onChange={event => setStatus(event.target.value)}
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="issued">Issued</option>
                <option value="paid">Paid</option>
                <option value="part_paid">Part paid</option>
                <option value="overdue">Overdue</option>
                <option value="void">Void</option>
                <option value="refunded">Refunded</option>
                <option value="credited">Credited</option>
              </select>
            </div>
            <label className="owner-field" style={{ alignContent: "flex-end" }}>
              <span>
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={event => setOverdueOnly(event.target.checked)}
                />{" "}
                Overdue only
              </span>
            </label>
          </div>
          <RecordsTable
            emptyTitle="No invoices"
            emptyDescription="Invoice records appear here when created. PDFs are only shown when a document reference exists."
            columns={[
              "Invoice",
              "Organisation",
              "Date",
              "Due",
              "Gross",
              "Status",
              "PO",
              "Document",
            ]}
            rows={((data.invoices as Array<Record<string, unknown>>) ?? []).map(row => [
              String(row.invoiceNumber ?? ""),
              String(row.organisationName ?? ""),
              String(row.invoiceDate ?? ""),
              String(row.dueDate ?? "—"),
              formatMoneyMinor(Number(row.grossMinor ?? 0), String(row.currency ?? "GBP")),
              String(row.status ?? ""),
              String(row.purchaseOrderReference ?? "—"),
              row.hasDocument ? "Reference recorded" : "No PDF available",
            ])}
          />
        </>
      ) : null}

      {!loading && data && tab === "payment_methods" ? (
        <>
          <p className="owner-muted">{String(data.integrationBoundary ?? "")}</p>
          <RecordsTable
            emptyTitle="No payment methods"
            emptyDescription="Only masked provider metadata is stored. Full card numbers and CVV are never retained."
            columns={[
              "Organisation",
              "Type",
              "Provider",
              "Descriptor",
              "Default",
              "Status",
              "Created",
            ]}
            rows={((data.paymentMethods as Array<Record<string, unknown>>) ?? []).map(
              row => [
                String(row.organisationName ?? ""),
                String(row.methodType ?? ""),
                String(row.provider ?? "—"),
                String(row.maskedDescriptor ?? ""),
                row.isDefault ? "Yes" : "No",
                String(row.status ?? ""),
                row.createdAt
                  ? new Date(String(row.createdAt)).toLocaleDateString()
                  : "—",
              ]
            )}
          />
        </>
      ) : null}

      {!loading && data && tab === "purchase_orders" ? (
        <RecordsTable
          emptyTitle="No purchase orders"
          emptyDescription="Purchase orders for NHS and enterprise customers will appear here."
          columns={[
            "Organisation",
            "PO number",
            "Approved",
            "Invoiced",
            "Remaining",
            "Expires",
            "Status",
            "Warnings",
          ]}
          rows={((data.purchaseOrders as Array<Record<string, unknown>>) ?? []).map(
            row => [
              String(row.organisationName ?? ""),
              String(row.poNumber ?? ""),
              formatMoneyMinor(
                Number(row.approvedValueMinor ?? 0),
                String(row.currency ?? "GBP")
              ),
              formatMoneyMinor(
                Number(row.amountInvoicedMinor ?? 0),
                String(row.currency ?? "GBP")
              ),
              formatMoneyMinor(
                Number(row.remainingBalanceMinor ?? 0),
                String(row.currency ?? "GBP")
              ),
              String(row.expiresAt ?? "—"),
              String(row.status ?? ""),
              Array.isArray(row.warnings) && row.warnings.length
                ? row.warnings.join("; ")
                : "—",
            ]
          )}
        />
      ) : null}

      {!loading && data && tab === "contracts" ? (
        <RecordsTable
          emptyTitle="No contracts"
          emptyDescription="Commercial contract records will appear here. Full document management is not included."
          columns={[
            "Organisation",
            "Name",
            "Reference",
            "Start",
            "End",
            "Renewal",
            "Value",
            "Status",
          ]}
          rows={((data.contracts as Array<Record<string, unknown>>) ?? []).map(row => [
            String(row.organisationName ?? ""),
            String(row.name ?? ""),
            String(row.reference ?? "—"),
            String(row.startsAt ?? "—"),
            String(row.endsAt ?? "—"),
            String(row.renewalType ?? ""),
            row.contractValueMinor == null
              ? "Not available"
              : formatMoneyMinor(
                  Number(row.contractValueMinor),
                  String(row.currency ?? "GBP")
                ),
            String(row.status ?? ""),
          ])}
        />
      ) : null}

      {!loading && data && tab === "trials" ? (
        <RecordsTable
          emptyTitle="No trials"
          emptyDescription="Trial management records will appear when organisations are placed on trial."
          columns={[
            "Organisation",
            "Start",
            "End",
            "Duration",
            "Managers",
            "Team members",
            "Conversations",
            "Preparations",
            "Conversion",
            "Follow-up",
          ]}
          rows={((data.trials as Array<Record<string, unknown>>) ?? []).map(row => [
            String(row.organisationName ?? ""),
            String(row.trialStartsAt ?? ""),
            String(row.trialEndsAt ?? ""),
            String(row.durationDays ?? ""),
            `${row.managersActivated ?? 0}/${row.managersInvited ?? 0}`,
            String(row.teamMembers ?? 0),
            String(row.conversationsCompleted ?? 0),
            String(row.preparationsGenerated ?? 0),
            String(row.conversionStatus ?? "").replaceAll("_", " "),
            String(row.followUpAt ?? "—"),
          ])}
        />
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

function RecordsTable({
  columns,
  rows,
  emptyTitle,
  emptyDescription,
}: {
  columns: string[];
  rows: string[][];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (rows.length === 0) {
    return <OwnerEmpty title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <div className="owner-table-wrap">
        <table className="owner-table">
          <thead>
            <tr>
              {columns.map(column => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`}>
                    {cellIndex === columns.indexOf("Status") ? (
                      <OwnerStatus value={cell} label={cell} />
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="owner-stack" aria-label="Commercial records">
        {rows.map((row, index) => (
          <article key={`stack-${index}`} className="owner-stack-card">
            {columns.map((column, cellIndex) => (
              <div key={column} className="owner-stack-card__row">
                <span className="owner-stack-card__label">{column}</span>
                <span>{row[cellIndex]}</span>
              </div>
            ))}
          </article>
        ))}
      </div>
    </>
  );
}
