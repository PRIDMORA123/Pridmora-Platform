/** Minor units (pence/cents). Never invent commercial figures in UI — format only. */

export function formatMoneyMinor(
  amountMinor: number | null | undefined,
  currency = "GBP"
): string {
  if (amountMinor === null || amountMinor === undefined) {
    return "Not available";
  }
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function monthlyFromSubscription(input: {
  billingFrequency: string;
  monthlyValueMinor: number | null;
  annualValueMinor: number | null;
}): number | null {
  if (
    input.monthlyValueMinor !== null &&
    input.monthlyValueMinor !== undefined
  ) {
    return input.monthlyValueMinor;
  }
  if (
    input.billingFrequency === "annual" &&
    input.annualValueMinor !== null &&
    input.annualValueMinor !== undefined
  ) {
    return Math.round(input.annualValueMinor / 12);
  }
  return null;
}

export function annualFromSubscription(input: {
  billingFrequency: string;
  monthlyValueMinor: number | null;
  annualValueMinor: number | null;
}): number | null {
  if (input.annualValueMinor !== null && input.annualValueMinor !== undefined) {
    return input.annualValueMinor;
  }
  if (
    input.billingFrequency === "monthly" &&
    input.monthlyValueMinor !== null &&
    input.monthlyValueMinor !== undefined
  ) {
    return input.monthlyValueMinor * 12;
  }
  return null;
}

export function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}
