/**
 * Temporary diagnostic logger for report date controls.
 * Off by default. Enable only with an explicit client URL flag:
 *   ?reportPeriodDebug=1
 *   #reportPeriodDebug=1
 * Browser console only. Must not mutate payloads or change submit behaviour.
 */
export const REPORT_PERIOD_DEBUG_PARAM = "reportPeriodDebug";

export type ReportPeriodDebugStage = "create" | "evidence-patch";

export type ReportPeriodDebugSnapshot = {
  stage: ReportPeriodDebugStage;
  startInputValue: string | null;
  endInputValue: string | null;
  detailsStart: string;
  detailsEnd: string;
  payload: {
    reportingPeriodStart?: string | null;
    reportingPeriodEnd?: string | null;
  };
  responseStart: string | null;
  responseEnd: string | null;
};

function flagEnabledInQuery(query: string): boolean {
  if (!query) return false;
  try {
    const params = new URLSearchParams(
      query.startsWith("?") || query.startsWith("#") ? query.slice(1) : query
    );
    return params.get(REPORT_PERIOD_DEBUG_PARAM) === "1";
  } catch {
    return false;
  }
}

export function isReportPeriodDebugEnabled(location?: {
  search?: string;
  hash?: string;
}): boolean {
  const search =
    location?.search ??
    (typeof window !== "undefined" ? window.location.search : "");
  const hash =
    location?.hash ??
    (typeof window !== "undefined" ? window.location.hash : "");
  return flagEnabledInQuery(search) || flagEnabledInQuery(hash);
}

export function logReportPeriodDebug(snapshot: ReportPeriodDebugSnapshot): void {
  if (!isReportPeriodDebugEnabled()) {
    return;
  }

  console.info("[report-period-debug]", snapshot);
}
