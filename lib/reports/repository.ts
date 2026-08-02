import type { SupabaseClient } from "@supabase/supabase-js";
import {
  developmentReportToRow,
  rowToDevelopmentReport,
  type DevelopmentReportRow,
} from "@/lib/reports/map";
import type {
  DevelopmentReport,
  ReportAudience,
  ReportType,
} from "@/lib/reports/types";
import {
  logSupabaseError,
  toSupabaseDbError,
} from "@/lib/supabase/errors";

function throwDb(
  error: { message: string; code?: string; details?: string; hint?: string },
  operation: string
): never {
  const dbError = toSupabaseDbError(error, { status: null, operation });
  logSupabaseError(operation, dbError, null);
  throw dbError;
}

export async function listDevelopmentReportsForClient(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<DevelopmentReport[]> {
  const { data, error } = await supabase
    .from("development_reports")
    .select("*")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throwDb(error, "development_reports.list");
  return (data ?? []).map(row =>
    rowToDevelopmentReport(row as DevelopmentReportRow)
  );
}

export async function getDevelopmentReport(
  supabase: SupabaseClient,
  coachId: string,
  reportId: string
): Promise<DevelopmentReport | null> {
  const { data, error } = await supabase
    .from("development_reports")
    .select("*")
    .eq("id", reportId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error) throwDb(error, "development_reports.get");
  if (!data) return null;
  return rowToDevelopmentReport(data as DevelopmentReportRow);
}

export async function getLatestApprovedDevelopmentReport(
  supabase: SupabaseClient,
  coachId: string
): Promise<(DevelopmentReport & { personName: string }) | null> {
  const { data, error } = await supabase
    .from("development_reports")
    .select("*")
    .eq("coach_id", coachId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throwDb(error, "development_reports.latest_approved");
  if (!data) return null;

  const report = rowToDevelopmentReport(data as DevelopmentReportRow);
  const { data: client } = await supabase
    .from("clients")
    .select("name")
    .eq("id", report.relationshipId)
    .eq("coach_id", coachId)
    .maybeSingle();

  return {
    ...report,
    personName: String(client?.name ?? "Person"),
  };
}

export async function createDevelopmentReport(
  supabase: SupabaseClient,
  input: {
    coachId: string;
    relationshipId: string;
    type: ReportType;
    audience: ReportAudience;
    title: string;
    reportingPeriodStart?: string | null;
    reportingPeriodEnd?: string | null;
    includeCoachStatement?: boolean;
    coachingPurpose?: string | null;
    requestId?: string | null;
  }
): Promise<DevelopmentReport> {
  const payload = developmentReportToRow({
    ...(input.requestId ? { id: input.requestId } : {}),
    relationshipId: input.relationshipId,
    coachId: input.coachId,
    type: input.type,
    audience: input.audience,
    title: input.title,
    reportingPeriodStart: input.reportingPeriodStart ?? null,
    reportingPeriodEnd: input.reportingPeriodEnd ?? null,
    status: "draft",
    coachingPurpose: input.coachingPurpose ?? null,
    includeCoachStatement: input.includeCoachStatement ?? false,
    executiveSummary: null,
    progressSummary: null,
    developmentThemes: [],
    evidenceItems: [],
    commitments: [],
    futurePriorities: [],
    coachStatement: null,
    associatedIndicators: [],
    impactMetrics: null,
    parentReportId: null,
    confidentialityConfirmedAt: null,
    approvedAt: null,
  });

  const { data, error } = await supabase
    .from("development_reports")
    .insert(payload)
    .select("*")
    .single();

  if (error?.code === "23505" && input.requestId) {
    const existing = await getDevelopmentReport(
      supabase,
      input.coachId,
      input.requestId
    );
    if (existing) return existing;
  }

  if (error) throwDb(error, "development_reports.create");
  return rowToDevelopmentReport(data as DevelopmentReportRow);
}

export async function updateDraftDevelopmentReport(
  supabase: SupabaseClient,
  coachId: string,
  reportId: string,
  patch: Partial<DevelopmentReport>
): Promise<DevelopmentReport> {
  const existing = await getDevelopmentReport(supabase, coachId, reportId);
  if (!existing) {
    throw Object.assign(new Error("Report not found."), { status: 404 });
  }
  if (existing.status === "approved") {
    throw Object.assign(
      new Error("Approved reports are immutable. Create a new draft instead."),
      { status: 409 }
    );
  }

  const next: DevelopmentReport = {
    ...existing,
    ...patch,
    id: existing.id,
    relationshipId: existing.relationshipId,
    coachId: existing.coachId,
    status: "draft",
    approvedAt: null,
    confidentialityConfirmedAt:
      patch.confidentialityConfirmedAt !== undefined
        ? patch.confidentialityConfirmedAt
        : existing.confidentialityConfirmedAt,
  };

  const { data, error } = await supabase
    .from("development_reports")
    .update(developmentReportToRow(next))
    .eq("id", reportId)
    .eq("coach_id", coachId)
    .eq("status", "draft")
    .select("*")
    .single();

  if (error) throwDb(error, "development_reports.update");
  return rowToDevelopmentReport(data as DevelopmentReportRow);
}

export async function approveDevelopmentReport(
  supabase: SupabaseClient,
  coachId: string,
  reportId: string
): Promise<DevelopmentReport> {
  const existing = await getDevelopmentReport(supabase, coachId, reportId);
  if (!existing) {
    throw Object.assign(new Error("Report not found."), { status: 404 });
  }
  if (existing.status === "approved") {
    return existing;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("development_reports")
    .update({
      status: "approved",
      confidentiality_confirmed_at:
        existing.confidentialityConfirmedAt ?? now,
      approved_at: now,
    })
    .eq("id", reportId)
    .eq("coach_id", coachId)
    .eq("status", "draft")
    .select("*")
    .single();

  if (error) throwDb(error, "development_reports.approve");
  return rowToDevelopmentReport(data as DevelopmentReportRow);
}

/**
 * Create a new draft cloned from an approved report so the approved
 * version remains an immutable snapshot.
 */
export async function createDraftFromApprovedReport(
  supabase: SupabaseClient,
  coachId: string,
  approvedReportId: string
): Promise<DevelopmentReport> {
  const existing = await getDevelopmentReport(
    supabase,
    coachId,
    approvedReportId
  );
  if (!existing) {
    throw Object.assign(new Error("Report not found."), { status: 404 });
  }
  if (existing.status !== "approved") {
    throw Object.assign(
      new Error("Only approved reports can be versioned into a new draft."),
      { status: 400 }
    );
  }

  const payload = developmentReportToRow({
    ...existing,
    status: "draft",
    parentReportId: existing.id,
    confidentialityConfirmedAt: null,
    approvedAt: null,
    title: `${existing.title} (draft)`,
  });

  const { data, error } = await supabase
    .from("development_reports")
    .insert(payload)
    .select("*")
    .single();

  if (error) throwDb(error, "development_reports.create_from_approved");
  return rowToDevelopmentReport(data as DevelopmentReportRow);
}

export async function deleteDraftDevelopmentReport(
  supabase: SupabaseClient,
  coachId: string,
  reportId: string
): Promise<void> {
  const { error } = await supabase
    .from("development_reports")
    .delete()
    .eq("id", reportId)
    .eq("coach_id", coachId)
    .eq("status", "draft");

  if (error) throwDb(error, "development_reports.delete");
}
