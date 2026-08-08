import type { PaymentMethodType } from "@/lib/owner/types";

/**
 * Build a safe masked descriptor. Never store or display full card numbers / CVV.
 */
export function buildMaskedPaymentDescriptor(input: {
  methodType: PaymentMethodType;
  brand?: string | null;
  lastFour?: string | null;
  billingName?: string | null;
}): string {
  if (input.methodType === "card") {
    const brand = (input.brand || "Card").trim();
    const lastFour = sanitiseLastFour(input.lastFour);
    return lastFour ? `${brand} •••• ${lastFour}` : brand;
  }
  if (input.methodType === "direct_debit") {
    const lastFour = sanitiseLastFour(input.lastFour);
    return lastFour
      ? `Direct Debit •••• ${lastFour}`
      : "Direct Debit (provider-masked)";
  }
  if (input.methodType === "bank_transfer") {
    return "Bank transfer / invoice account";
  }
  if (input.methodType === "purchase_order") {
    return "Purchase order / invoice";
  }
  return "Payment method";
}

export function sanitiseLastFour(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-4);
}

/** Reject payloads that attempt to store full PAN / CVV. */
export function assertSafePaymentMethodPayload(input: {
  lastFour?: string | null;
  cardNumber?: unknown;
  cvv?: unknown;
  cvc?: unknown;
  pan?: unknown;
}): { ok: true } | { ok: false; error: string } {
  if (
    input.cardNumber !== undefined ||
    input.cvv !== undefined ||
    input.cvc !== undefined ||
    input.pan !== undefined
  ) {
    return {
      ok: false,
      error: "Full card details and CVV must not be submitted.",
    };
  }
  if (input.lastFour && input.lastFour.replace(/\D/g, "").length > 4) {
    return {
      ok: false,
      error: "Only the last four digits may be stored for card methods.",
    };
  }
  return { ok: true };
}
