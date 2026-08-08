import {
  CUSTOMER_HEALTH_LABELS,
  type AccountStatus,
  type CustomerHealth,
  type CustomerHealthLevel,
  type OrganisationUsageCounts,
} from "@/lib/owner/types";

export type CustomerHealthInput = {
  accountStatus: AccountStatus;
  managersInvited: number;
  managersActivated: number;
  activeUsers30d: number;
  conversationsCompleted30d: number;
  lastActivityAt: string | null;
  renewalOrTrialDate: string | null;
  outstandingInvoiceCount: number;
  overdueInvoiceCount: number;
  now?: Date;
};

function daysUntil(dateIso: string | null, now: Date): number | null {
  if (!dateIso) return null;
  const target = new Date(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function daysSince(dateIso: string | null, now: Date): number | null {
  if (!dateIso) return null;
  const then = new Date(dateIso);
  if (Number.isNaN(then.getTime())) return null;
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Explainable customer health from observable operational signals.
 * No opaque scoring or invented conversion probability.
 */
export function calculateCustomerHealth(
  input: CustomerHealthInput
): CustomerHealth {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  let level: CustomerHealthLevel = "healthy";

  if (input.accountStatus === "suspended" || input.accountStatus === "cancelled") {
    return {
      level: "needs_attention",
      label: CUSTOMER_HEALTH_LABELS.needs_attention,
      reasons: [
        input.accountStatus === "suspended"
          ? "Account is suspended"
          : "Account is cancelled",
      ],
    };
  }

  const activationPct =
    input.managersInvited > 0
      ? Math.round((input.managersActivated / input.managersInvited) * 100)
      : null;

  if (activationPct !== null && activationPct < 40) {
    level = "needs_attention";
    reasons.push(
      `${input.managersActivated} of ${input.managersInvited} managers have activated`
    );
  } else if (activationPct !== null && activationPct < 70) {
    if (level === "healthy") level = "watch";
    reasons.push(
      `${activationPct}% manager activation (${input.managersActivated}/${input.managersInvited})`
    );
  }

  const inactiveDays = daysSince(input.lastActivityAt, now);
  if (inactiveDays !== null && inactiveDays >= 21) {
    level = "needs_attention";
    reasons.push(`No development activity in ${inactiveDays} days`);
  } else if (inactiveDays !== null && inactiveDays >= 10) {
    if (level === "healthy") level = "watch";
    reasons.push(`Last activity ${inactiveDays} days ago`);
  } else if (input.lastActivityAt === null && input.managersInvited > 0) {
    if (level === "healthy") level = "watch";
    reasons.push("No recorded platform activity yet");
  }

  if (input.conversationsCompleted30d === 0 && input.managersActivated > 0) {
    if (level === "healthy") level = "watch";
    reasons.push("No development conversations completed in the last 30 days");
  }

  if (input.activeUsers30d === 0 && input.managersActivated > 0) {
    if (level === "healthy") level = "watch";
    reasons.push("No active users in the last 30 days");
  }

  const daysToRenewal = daysUntil(input.renewalOrTrialDate, now);
  if (daysToRenewal !== null && daysToRenewal >= 0 && daysToRenewal <= 14) {
    if (level === "healthy") level = "watch";
    if (daysToRenewal <= 7) level = "needs_attention";
    reasons.push(
      input.accountStatus === "trial"
        ? `Trial ends in ${daysToRenewal} day${daysToRenewal === 1 ? "" : "s"}`
        : `Renewal in ${daysToRenewal} day${daysToRenewal === 1 ? "" : "s"}`
    );
  }

  if (input.overdueInvoiceCount > 0) {
    level = "needs_attention";
    reasons.push(
      `${input.overdueInvoiceCount} overdue invoice${
        input.overdueInvoiceCount === 1 ? "" : "s"
      }`
    );
  } else if (input.outstandingInvoiceCount > 0) {
    if (level === "healthy") level = "watch";
    reasons.push(
      `${input.outstandingInvoiceCount} outstanding invoice${
        input.outstandingInvoiceCount === 1 ? "" : "s"
      }`
    );
  }

  if (reasons.length === 0) {
    reasons.push("Activation, activity and commercial signals look stable");
  }

  return {
    level,
    label: CUSTOMER_HEALTH_LABELS[level],
    reasons,
  };
}

export function healthFromUsage(input: {
  accountStatus: AccountStatus;
  usage: OrganisationUsageCounts;
  renewalOrTrialDate: string | null;
  outstandingInvoiceCount?: number;
  overdueInvoiceCount?: number;
  now?: Date;
}): CustomerHealth {
  return calculateCustomerHealth({
    accountStatus: input.accountStatus,
    managersInvited: input.usage.managersInvited,
    managersActivated: input.usage.managersActivated,
    activeUsers30d: input.usage.activeUsers30d,
    conversationsCompleted30d: input.usage.conversationsCompleted30d,
    lastActivityAt: input.usage.lastActivityAt,
    renewalOrTrialDate: input.renewalOrTrialDate,
    outstandingInvoiceCount: input.outstandingInvoiceCount ?? 0,
    overdueInvoiceCount: input.overdueInvoiceCount ?? 0,
    now: input.now,
  });
}
