import type { PurchaseOrder, PurchaseOrderStatus } from "@/lib/owner/types";

export function remainingPoBalance(
  approvedValueMinor: number,
  amountInvoicedMinor: number
): number {
  return Math.max(0, approvedValueMinor - amountInvoicedMinor);
}

export function derivePurchaseOrderStatus(input: {
  status: PurchaseOrderStatus;
  approvedValueMinor: number;
  amountInvoicedMinor: number;
  expiresAt: string | null;
  now?: Date;
}): PurchaseOrderStatus {
  if (input.status === "cancelled") return "cancelled";
  if (input.amountInvoicedMinor >= input.approvedValueMinor && input.approvedValueMinor > 0) {
    return "fully_used";
  }

  const now = input.now ?? new Date();
  if (input.expiresAt) {
    const expires = new Date(`${input.expiresAt}T00:00:00.000Z`);
    if (!Number.isNaN(expires.getTime())) {
      if (expires.getTime() < now.getTime()) return "expired";
      const days =
        (expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      if (days <= 30) return "expiring";
    }
  }

  return input.status === "expiring" || input.status === "expired"
    ? "active"
    : input.status;
}

export function purchaseOrderWarnings(input: {
  status: PurchaseOrderStatus;
  approvedValueMinor: number;
  amountInvoicedMinor: number;
  expiresAt: string | null;
  invoiceRequiresPo?: boolean;
  invoiceHasPoReference?: boolean;
  now?: Date;
}): string[] {
  const warnings: string[] = [];
  const status = derivePurchaseOrderStatus(input);
  const remaining = remainingPoBalance(
    input.approvedValueMinor,
    input.amountInvoicedMinor
  );

  if (status === "expiring") {
    warnings.push("PO expires within 30 days");
  }
  if (status === "expired") {
    warnings.push("PO has expired");
  }
  if (
    input.approvedValueMinor > 0 &&
    remaining / input.approvedValueMinor <= 0.1
  ) {
    warnings.push("PO value nearly exhausted");
  }
  if (input.invoiceRequiresPo && !input.invoiceHasPoReference) {
    warnings.push("Invoice has no required PO");
  }

  return warnings;
}

export function toPurchaseOrderView(row: {
  id: string;
  organisation_id: string;
  po_number: string;
  description: string | null;
  approved_value_minor: number;
  currency: string;
  starts_at: string | null;
  expires_at: string | null;
  amount_invoiced_minor: number;
  status: PurchaseOrderStatus;
  document_reference: string | null;
}): PurchaseOrder {
  const status = derivePurchaseOrderStatus({
    status: row.status,
    approvedValueMinor: row.approved_value_minor,
    amountInvoicedMinor: row.amount_invoiced_minor,
    expiresAt: row.expires_at,
  });
  return {
    id: row.id,
    organisationId: row.organisation_id,
    poNumber: row.po_number,
    description: row.description,
    approvedValueMinor: row.approved_value_minor,
    currency: row.currency,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    amountInvoicedMinor: row.amount_invoiced_minor,
    remainingBalanceMinor: remainingPoBalance(
      row.approved_value_minor,
      row.amount_invoiced_minor
    ),
    status,
    documentReference: row.document_reference,
    warnings: purchaseOrderWarnings({
      status: row.status,
      approvedValueMinor: row.approved_value_minor,
      amountInvoicedMinor: row.amount_invoiced_minor,
      expiresAt: row.expires_at,
    }),
  };
}
