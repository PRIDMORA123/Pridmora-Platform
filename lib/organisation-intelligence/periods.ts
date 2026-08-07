import {
  DEFAULT_PERIOD_PRESET,
  type PeriodPreset,
} from "@/lib/organisation-intelligence/constants";
import type { OrganisationIntelligencePeriod } from "@/lib/organisation-intelligence/types";

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function periodLabel(preset: PeriodPreset, start: string, end: string): string {
  if (preset === "last_30_days") return "Last 30 days";
  if (preset === "last_90_days") return "Last 90 days";
  if (preset === "last_12_months") return "Last 12 months";
  return `${start} to ${end}`;
}

export function resolveOrganisationIntelligencePeriod(input?: {
  preset?: PeriodPreset | string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  now?: Date;
}): OrganisationIntelligencePeriod {
  const now = startOfUtcDay(input?.now ?? new Date());
  let preset: PeriodPreset =
    (input?.preset as PeriodPreset) || DEFAULT_PERIOD_PRESET;

  if (
    preset !== "last_30_days" &&
    preset !== "last_90_days" &&
    preset !== "last_12_months" &&
    preset !== "custom"
  ) {
    preset = DEFAULT_PERIOD_PRESET;
  }

  let periodEnd = now;
  let periodStart: Date;

  if (preset === "custom") {
    const startRaw = input?.periodStart?.trim();
    const endRaw = input?.periodEnd?.trim();
    if (!startRaw || !endRaw) {
      preset = DEFAULT_PERIOD_PRESET;
      periodStart = addUtcDays(now, -89);
    } else {
      periodStart = startOfUtcDay(new Date(`${startRaw}T00:00:00.000Z`));
      periodEnd = startOfUtcDay(new Date(`${endRaw}T00:00:00.000Z`));
      if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
        preset = DEFAULT_PERIOD_PRESET;
        periodEnd = now;
        periodStart = addUtcDays(now, -89);
      } else if (periodEnd < periodStart) {
        const swap = periodStart;
        periodStart = periodEnd;
        periodEnd = swap;
      }
    }
  } else if (preset === "last_30_days") {
    periodStart = addUtcDays(now, -29);
  } else if (preset === "last_12_months") {
    periodStart = addUtcDays(now, -364);
  } else {
    preset = "last_90_days";
    periodStart = addUtcDays(now, -89);
  }

  const dayCount =
    Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;
  const previousPeriodEnd = addUtcDays(periodStart, -1);
  const previousPeriodStart = addUtcDays(previousPeriodEnd, -(dayCount - 1));

  const start = toDateString(periodStart);
  const end = toDateString(periodEnd);
  const prevStart = toDateString(previousPeriodStart);
  const prevEnd = toDateString(previousPeriodEnd);

  return {
    preset,
    periodStart: start,
    periodEnd: end,
    previousPeriodStart: prevStart,
    previousPeriodEnd: prevEnd,
    label: periodLabel(preset, start, end),
    comparisonLabel: `Compared with ${prevStart} to ${prevEnd}`,
  };
}

export function parsePeriodPreset(value: unknown): PeriodPreset | null {
  if (typeof value !== "string") return null;
  if (
    value === "last_30_days" ||
    value === "last_90_days" ||
    value === "last_12_months" ||
    value === "custom"
  ) {
    return value;
  }
  return null;
}
