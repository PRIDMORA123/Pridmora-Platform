"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import {
  isMissingDevelopmentReportsTable,
  toSafeReportsUserMessage,
  type ReportsAvailability,
} from "@/lib/reports/availability";
import type { DevelopmentReport } from "@/lib/reports/types";

export async function loadRelationshipReportsSafely(
  relationshipId: string
): Promise<ReportsAvailability> {
  try {
    const data = await apiJson<{
      reports?: DevelopmentReport[];
      status?: "available" | "unavailable";
    }>(`/api/development-reports?clientId=${encodeURIComponent(relationshipId)}`);

    if (data.status === "unavailable") {
      return { status: "unavailable", reports: [] };
    }

    return {
      status: "available",
      reports: data.reports ?? [],
    };
  } catch (error) {
    if (isMissingDevelopmentReportsTable(error)) {
      console.error(
        "Development reports migration has not been applied.",
        error
      );
      return { status: "unavailable", reports: [] };
    }

    const message =
      error instanceof Error ? error.message.toLowerCase() : "";
    if (
      message.includes("development reporting is being prepared") ||
      message.includes("migration") ||
      message.includes("development_reports") ||
      message.includes("schema cache") ||
      message.includes("does not exist")
    ) {
      console.error(
        "Development reports migration has not been applied.",
        error
      );
      return { status: "unavailable", reports: [] };
    }

    throw error;
  }
}

export function useRelationshipReports(clientId: string | undefined) {
  const [availability, setAvailability] = useState<ReportsAvailability>({
    status: "available",
    reports: [],
  });
  const [loading, setLoading] = useState(Boolean(clientId));
  const [error, setError] = useState("");
  /** Explicit relationship-scoped cache key (coach resolved server-side). */
  const queryKey = clientId
    ? (["reports", "relationship", clientId] as const)
    : null;

  const refresh = useCallback(async () => {
    if (!clientId) {
      setAvailability({ status: "available", reports: [] });
      setLoading(false);
      return;
    }

    setAvailability({ status: "available", reports: [] });
    setLoading(true);
    setError("");
    try {
      const next = await loadRelationshipReportsSafely(clientId);
      setAvailability(next);
    } catch (err) {
      setAvailability({ status: "available", reports: [] });
      setError(toSafeReportsUserMessage(err));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh, queryKey?.[2]]);

  return {
    reports: availability.reports,
    availability,
    reportsAvailable: availability.status === "available",
    loading,
    error,
    refresh,
    queryKey,
  };
}
