import type { SupabaseClient } from "@supabase/supabase-js";
import { healthFromUsage } from "@/lib/owner/customer-health";
import {
  annualFromSubscription,
  monthlyFromSubscription,
  sumNullable,
} from "@/lib/owner/money";
import { toPurchaseOrderView } from "@/lib/owner/purchase-orders";
import type {
  AccountStatus,
  Invoice,
  OrganisationContract,
  OrganisationPaymentMethod,
  OrganisationSubscription,
  OrganisationTrial,
  OrganisationUsageCounts,
  OwnerOrganisationListItem,
  OwnerUserListItem,
  PlatformAuditEvent,
  PlatformPlan,
  PlatformUsageTotals,
  PurchaseOrder,
  SupportCase,
  TrialConversionStatus,
} from "@/lib/owner/types";

function asAccountStatus(licenceStatus: string | null | undefined): AccountStatus {
  if (
    licenceStatus === "trial" ||
    licenceStatus === "suspended" ||
    licenceStatus === "cancelled" ||
    licenceStatus === "expired" ||
    licenceStatus === "active"
  ) {
    return licenceStatus;
  }
  return "active";
}

function emptyUsage(): OrganisationUsageCounts {
  return {
    managersInvited: 0,
    managersActivated: 0,
    teamMembers: 0,
    activeMembers: 0,
    activeUsers30d: 0,
    conversationsCompleted30d: 0,
    conversationsCompletedTotal: 0,
    preparationsGenerated30d: 0,
    preparationsGeneratedTotal: 0,
    aiRequests30d: 0,
    lastActivityAt: null,
  };
}

export function mapUsageCounts(raw: Record<string, unknown> | null): OrganisationUsageCounts {
  if (!raw) return emptyUsage();
  return {
    managersInvited: Number(raw.managers_invited ?? 0),
    managersActivated: Number(raw.managers_activated ?? 0),
    teamMembers: Number(raw.team_members ?? 0),
    activeMembers: Number(raw.active_members ?? 0),
    activeUsers30d: Number(raw.active_users_30d ?? 0),
    conversationsCompleted30d: Number(raw.conversations_completed_30d ?? 0),
    conversationsCompletedTotal: Number(raw.conversations_completed_total ?? 0),
    preparationsGenerated30d: Number(raw.preparations_generated_30d ?? 0),
    preparationsGeneratedTotal: Number(raw.preparations_generated_total ?? 0),
    aiRequests30d: Number(raw.ai_requests_30d ?? 0),
    lastActivityAt:
      typeof raw.last_activity_at === "string" ? raw.last_activity_at : null,
  };
}

export async function loadPlatformUsageTotals(
  supabase: SupabaseClient
): Promise<PlatformUsageTotals> {
  const { data, error } = await supabase.rpc("owner_platform_usage_totals");
  if (error || !data) {
    return {
      activeOrganisations: 0,
      trialOrganisations: 0,
      totalManagers: 0,
      totalTeamMembers: 0,
      activeUsers30d: 0,
      conversations30d: 0,
      aiRequests30d: 0,
    };
  }
  const raw = data as Record<string, unknown>;
  return {
    activeOrganisations: Number(raw.active_organisations ?? 0),
    trialOrganisations: Number(raw.trial_organisations ?? 0),
    totalManagers: Number(raw.total_managers ?? 0),
    totalTeamMembers: Number(raw.total_team_members ?? 0),
    activeUsers30d: Number(raw.active_users_30d ?? 0),
    conversations30d: Number(raw.conversations_30d ?? 0),
    aiRequests30d: Number(raw.ai_requests_30d ?? 0),
  };
}

export async function loadOrganisationUsageCounts(
  supabase: SupabaseClient,
  organisationId: string
): Promise<OrganisationUsageCounts> {
  const { data, error } = await supabase.rpc("owner_organisation_usage_counts", {
    p_organisation_id: organisationId,
  });
  if (error) return emptyUsage();
  return mapUsageCounts(data as Record<string, unknown>);
}

export async function listOwnerOrganisations(
  supabase: SupabaseClient,
  filters?: {
    search?: string;
    status?: string;
    plan?: string;
  }
): Promise<OwnerOrganisationListItem[]> {
  let query = supabase
    .from("organisations")
    .select(
      "id, name, legal_name, trading_name, sector, company_size, organisation_type, status, licence_plan_name, licence_status, licence_ends_at, primary_contact_name, primary_contact_email, created_at"
    )
    .neq("organisation_type", "personal")
    .order("name", { ascending: true });

  if (filters?.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(
      `name.ilike.${term},legal_name.ilike.${term},trading_name.ilike.${term},primary_contact_email.ilike.${term}`
    );
  }
  if (filters?.status && filters.status !== "all") {
    query = query.eq("licence_status", filters.status);
  }
  if (filters?.plan && filters.plan !== "all") {
    query = query.ilike("licence_plan_name", filters.plan);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const orgIds = data.map(row => row.id as string);
  const [invoicesResult, usagePairs] = await Promise.all([
    orgIds.length
      ? supabase
          .from("invoices")
          .select("organisation_id, status")
          .in("organisation_id", orgIds)
      : Promise.resolve({ data: [] as Array<{ organisation_id: string; status: string }> }),
    Promise.all(
      orgIds.map(async id => [id, await loadOrganisationUsageCounts(supabase, id)] as const)
    ),
  ]);

  const usageByOrg = new Map(usagePairs);
  const invoiceStats = new Map<string, { outstanding: number; overdue: number }>();
  for (const inv of invoicesResult.data ?? []) {
    const current = invoiceStats.get(inv.organisation_id) ?? {
      outstanding: 0,
      overdue: 0,
    };
    if (["issued", "part_paid", "overdue"].includes(inv.status)) {
      current.outstanding += 1;
    }
    if (inv.status === "overdue") current.overdue += 1;
    invoiceStats.set(inv.organisation_id, current);
  }

  return data.map(row => {
    const usage = usageByOrg.get(row.id as string) ?? emptyUsage();
    const accountStatus = asAccountStatus(row.licence_status as string);
    const inv = invoiceStats.get(row.id as string) ?? {
      outstanding: 0,
      overdue: 0,
    };
    return {
      id: row.id as string,
      name: row.name as string,
      legalName: (row.legal_name as string | null) ?? null,
      tradingName: (row.trading_name as string | null) ?? null,
      sector: (row.sector as string | null) ?? null,
      companySize: (row.company_size as string | null) ?? null,
      organisationType: row.organisation_type as string,
      accountStatus,
      planName: (row.licence_plan_name as string) || "Pilot",
      primaryContactName: (row.primary_contact_name as string | null) ?? null,
      primaryContactEmail: (row.primary_contact_email as string | null) ?? null,
      managers: usage.managersInvited,
      teamMembers: usage.teamMembers,
      health: healthFromUsage({
        accountStatus,
        usage,
        renewalOrTrialDate: (row.licence_ends_at as string | null) ?? null,
        outstandingInvoiceCount: inv.outstanding,
        overdueInvoiceCount: inv.overdue,
      }),
      renewalOrTrialDate: (row.licence_ends_at as string | null) ?? null,
      lastActivityAt: usage.lastActivityAt,
    };
  });
}

export async function getOwnerOrganisationDetail(
  supabase: SupabaseClient,
  organisationId: string
) {
  const { data, error } = await supabase
    .from("organisations")
    .select(
      "id, name, legal_name, trading_name, sector, company_size, organisation_type, status, licence_plan_name, licence_status, licence_starts_at, licence_ends_at, practitioner_seats_purchased, primary_contact_name, primary_contact_email, billing_contact_name, billing_contact_email, account_owner_label, created_at, updated_at"
    )
    .eq("id", organisationId)
    .maybeSingle();

  if (error || !data) return null;

  const usage = await loadOrganisationUsageCounts(supabase, organisationId);
  const accountStatus = asAccountStatus(data.licence_status as string);

  const { count: overdueCount } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("status", "overdue");

  const { count: outstandingCount } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .in("status", ["issued", "part_paid", "overdue"]);

  const health = healthFromUsage({
    accountStatus,
    usage,
    renewalOrTrialDate: (data.licence_ends_at as string | null) ?? null,
    outstandingInvoiceCount: outstandingCount ?? 0,
    overdueInvoiceCount: overdueCount ?? 0,
  });

  return {
    organisation: {
      id: data.id as string,
      name: data.name as string,
      legalName: (data.legal_name as string | null) ?? null,
      tradingName: (data.trading_name as string | null) ?? null,
      sector: (data.sector as string | null) ?? null,
      companySize: (data.company_size as string | null) ?? null,
      organisationType: data.organisation_type as string,
      status: data.status as string,
      accountStatus,
      planName: (data.licence_plan_name as string) || "Pilot",
      seatsPurchased: Number(data.practitioner_seats_purchased ?? 0),
      licenceStartsAt: (data.licence_starts_at as string | null) ?? null,
      licenceEndsAt: (data.licence_ends_at as string | null) ?? null,
      primaryContactName: (data.primary_contact_name as string | null) ?? null,
      primaryContactEmail: (data.primary_contact_email as string | null) ?? null,
      billingContactName: (data.billing_contact_name as string | null) ?? null,
      billingContactEmail: (data.billing_contact_email as string | null) ?? null,
      accountOwnerLabel: (data.account_owner_label as string | null) ?? null,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    },
    usage,
    health,
  };
}

export async function listOwnerUsers(
  supabase: SupabaseClient,
  filters?: {
    search?: string;
    organisationId?: string;
    role?: string;
    status?: string;
  }
): Promise<OwnerUserListItem[]> {
  const { data, error } = await supabase.rpc("owner_list_platform_users", {
    p_search: filters?.search?.trim() || null,
    p_organisation_id: filters?.organisationId || null,
    p_role: filters?.role || null,
    p_status: filters?.status || null,
    p_limit: 200,
  });

  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map(row => ({
    membershipId: String(row.membership_id),
    userId: String(row.user_id),
    organisationId: String(row.organisation_id),
    organisationName: String(row.organisation_name ?? ""),
    role: String(row.role ?? ""),
    professionalRole:
      typeof row.professional_role === "string" ? row.professional_role : null,
    status: String(row.status ?? ""),
    fullName: String(row.full_name ?? ""),
    email: String(row.email ?? ""),
    lastActiveAt:
      typeof row.last_active_at === "string" ? row.last_active_at : null,
    joinedAt: typeof row.joined_at === "string" ? row.joined_at : null,
    invitedAt: typeof row.invited_at === "string" ? row.invited_at : null,
    createdAt: String(row.created_at ?? ""),
    invitationStatus: String(row.invitation_status ?? ""),
  }));
}

export async function listSubscriptions(
  supabase: SupabaseClient
): Promise<OrganisationSubscription[]> {
  const { data, error } = await supabase
    .from("organisation_subscriptions")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapSubscription);
}

function mapSubscription(row: Record<string, unknown>): OrganisationSubscription {
  return {
    id: row.id as string,
    organisationId: row.organisation_id as string,
    planId: (row.plan_id as string | null) ?? null,
    planCode: (row.plan_code as string) || "pilot",
    seats: Number(row.seats ?? 0),
    billingFrequency: row.billing_frequency as OrganisationSubscription["billingFrequency"],
    status: row.status as OrganisationSubscription["status"],
    currency: (row.currency as string) || "GBP",
    monthlyValueMinor:
      row.monthly_value_minor === null || row.monthly_value_minor === undefined
        ? null
        : Number(row.monthly_value_minor),
    annualValueMinor:
      row.annual_value_minor === null || row.annual_value_minor === undefined
        ? null
        : Number(row.annual_value_minor),
    startsAt: (row.starts_at as string | null) ?? null,
    renewalAt: (row.renewal_at as string | null) ?? null,
    trialEndsAt: (row.trial_ends_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    externalProvider: (row.external_provider as string | null) ?? null,
    externalCustomerId: (row.external_customer_id as string | null) ?? null,
    externalSubscriptionId: (row.external_subscription_id as string | null) ?? null,
  };
}

export async function listInvoices(
  supabase: SupabaseClient,
  filters?: { organisationId?: string; status?: string; overdueOnly?: boolean }
): Promise<Invoice[]> {
  let query = supabase
    .from("invoices")
    .select("*")
    .order("invoice_date", { ascending: false });

  if (filters?.organisationId) {
    query = query.eq("organisation_id", filters.organisationId);
  }
  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.overdueOnly) {
    query = query.eq("status", "overdue");
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(row => ({
    id: row.id as string,
    organisationId: row.organisation_id as string,
    invoiceNumber: row.invoice_number as string,
    invoiceDate: row.invoice_date as string,
    dueDate: (row.due_date as string | null) ?? null,
    netMinor: Number(row.net_minor ?? 0),
    vatMinor: Number(row.vat_minor ?? 0),
    grossMinor: Number(row.gross_minor ?? 0),
    currency: (row.currency as string) || "GBP",
    status: row.status as Invoice["status"],
    paymentDate: (row.payment_date as string | null) ?? null,
    paymentMethodId: (row.payment_method_id as string | null) ?? null,
    purchaseOrderReference: (row.purchase_order_reference as string | null) ?? null,
    externalProvider: (row.external_provider as string | null) ?? null,
    externalInvoiceId: (row.external_invoice_id as string | null) ?? null,
    documentReference: (row.document_reference as string | null) ?? null,
  }));
}

export async function listPaymentMethods(
  supabase: SupabaseClient,
  organisationId?: string
): Promise<OrganisationPaymentMethod[]> {
  let query = supabase
    .from("organisation_payment_methods")
    .select("*")
    .order("created_at", { ascending: false });
  if (organisationId) query = query.eq("organisation_id", organisationId);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(row => ({
    id: row.id as string,
    organisationId: row.organisation_id as string,
    methodType: row.method_type as OrganisationPaymentMethod["methodType"],
    provider: (row.provider as string | null) ?? null,
    providerCustomerId: (row.provider_customer_id as string | null) ?? null,
    providerPaymentMethodId:
      (row.provider_payment_method_id as string | null) ?? null,
    brand: (row.brand as string | null) ?? null,
    lastFour: (row.last_four as string | null) ?? null,
    expMonth: row.exp_month === null ? null : Number(row.exp_month),
    expYear: row.exp_year === null ? null : Number(row.exp_year),
    billingName: (row.billing_name as string | null) ?? null,
    maskedDescriptor: (row.masked_descriptor as string) || "",
    isDefault: Boolean(row.is_default),
    status: row.status as string,
    createdAt: row.created_at as string,
  }));
}

export async function listPurchaseOrders(
  supabase: SupabaseClient,
  organisationId?: string
): Promise<PurchaseOrder[]> {
  let query = supabase
    .from("purchase_orders")
    .select("*")
    .order("expires_at", { ascending: true, nullsFirst: false });
  if (organisationId) query = query.eq("organisation_id", organisationId);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(row =>
    toPurchaseOrderView(row as Parameters<typeof toPurchaseOrderView>[0])
  );
}

export async function listContracts(
  supabase: SupabaseClient,
  organisationId?: string
): Promise<OrganisationContract[]> {
  let query = supabase
    .from("organisation_contracts")
    .select("*")
    .order("ends_at", { ascending: true, nullsFirst: false });
  if (organisationId) query = query.eq("organisation_id", organisationId);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(row => ({
    id: row.id as string,
    organisationId: row.organisation_id as string,
    name: row.name as string,
    reference: (row.reference as string | null) ?? null,
    startsAt: (row.starts_at as string | null) ?? null,
    endsAt: (row.ends_at as string | null) ?? null,
    noticePeriodDays:
      row.notice_period_days === null ? null : Number(row.notice_period_days),
    renewalType: row.renewal_type as string,
    contractValueMinor:
      row.contract_value_minor === null || row.contract_value_minor === undefined
        ? null
        : Number(row.contract_value_minor),
    currency: (row.currency as string) || "GBP",
    accountOwner: (row.account_owner as string | null) ?? null,
    status: row.status as OrganisationContract["status"],
    documentReference: (row.document_reference as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  }));
}

export async function listTrials(
  supabase: SupabaseClient
): Promise<Array<OrganisationTrial & { organisationName?: string }>> {
  const { data, error } = await supabase
    .from("organisation_trials")
    .select("*")
    .order("trial_ends_at", { ascending: true });
  if (error || !data) return [];
  return data.map(row => ({
    id: row.id as string,
    organisationId: row.organisation_id as string,
    trialStartsAt: row.trial_starts_at as string,
    trialEndsAt: row.trial_ends_at as string,
    durationDays: Number(row.duration_days ?? 0),
    conversionStatus: row.conversion_status as TrialConversionStatus,
    followUpAt: (row.follow_up_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  }));
}

export async function listSupportCases(
  supabase: SupabaseClient,
  filters?: { status?: string; priority?: string; organisationId?: string }
): Promise<SupportCase[]> {
  let query = supabase
    .from("support_cases")
    .select("*")
    .order("updated_at", { ascending: false });
  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.priority && filters.priority !== "all") {
    query = query.eq("priority", filters.priority);
  }
  if (filters?.organisationId) {
    query = query.eq("organisation_id", filters.organisationId);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(row => ({
    id: row.id as string,
    organisationId: (row.organisation_id as string | null) ?? null,
    userId: (row.user_id as string | null) ?? null,
    category: row.category as SupportCase["category"],
    subject: row.subject as string,
    description: (row.description as string) || "",
    status: row.status as SupportCase["status"],
    priority: row.priority as SupportCase["priority"],
    assignedTo: (row.assigned_to as string | null) ?? null,
    resolutionNotes: (row.resolution_notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export async function listPlatformAuditEvents(
  supabase: SupabaseClient,
  limit = 100
): Promise<PlatformAuditEvent[]> {
  const { data, error } = await supabase
    .from("platform_audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(row => ({
    id: row.id as string,
    actorUserId: (row.actor_user_id as string | null) ?? null,
    action: row.action as string,
    entityType: row.entity_type as string,
    entityId: (row.entity_id as string | null) ?? null,
    organisationId: (row.organisation_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  }));
}

export async function listPlatformPlans(
  supabase: SupabaseClient
): Promise<PlatformPlan[]> {
  const { data, error } = await supabase
    .from("platform_plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map(row => ({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    billingFrequency: row.billing_frequency as PlatformPlan["billingFrequency"],
    currency: (row.currency as string) || "GBP",
    unitAmountMinor:
      row.unit_amount_minor === null || row.unit_amount_minor === undefined
        ? null
        : Number(row.unit_amount_minor),
    seatsIncluded:
      row.seats_included === null || row.seats_included === undefined
        ? null
        : Number(row.seats_included),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 100),
  }));
}

export async function loadCommercialOverview(supabase: SupabaseClient) {
  const [subscriptions, invoices, trials] = await Promise.all([
    listSubscriptions(supabase),
    listInvoices(supabase),
    listTrials(supabase),
  ]);

  const activeSubscriptions = subscriptions.filter(s => s.status === "active");
  const trialAccounts = subscriptions.filter(s => s.status === "trial").length
    || trials.filter(t => !["converted", "not_converted"].includes(t.conversionStatus)).length;

  const mrrValues = activeSubscriptions.map(s =>
    monthlyFromSubscription({
      billingFrequency: s.billingFrequency,
      monthlyValueMinor: s.monthlyValueMinor,
      annualValueMinor: s.annualValueMinor,
    })
  );
  const arrValues = activeSubscriptions.map(s =>
    annualFromSubscription({
      billingFrequency: s.billingFrequency,
      monthlyValueMinor: s.monthlyValueMinor,
      annualValueMinor: s.annualValueMinor,
    })
  );

  const outstanding = invoices.filter(i =>
    ["issued", "part_paid", "overdue"].includes(i.status)
  );
  const overdue = invoices.filter(i => i.status === "overdue");

  const now = new Date();
  const withinDays = (date: string | null, days: number) => {
    if (!date) return false;
    const target = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(target.getTime())) return false;
    const diff = (target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    return diff >= 0 && diff <= days;
  };

  return {
    mrrMinor: sumNullable(mrrValues),
    arrMinor: sumNullable(arrValues),
    activeSubscriptions: activeSubscriptions.length,
    trialAccounts,
    trialsConverting: trials.filter(t =>
      ["conversion_discussion", "review_required"].includes(t.conversionStatus)
    ).length,
    outstandingInvoices: outstanding.length,
    overdueValueMinor:
      overdue.length === 0
        ? null
        : overdue.reduce((sum, inv) => sum + inv.grossMinor, 0),
    renewals30: subscriptions.filter(s => withinDays(s.renewalAt, 30)).length,
    renewals60: subscriptions.filter(s => withinDays(s.renewalAt, 60)).length,
    renewals90: subscriptions.filter(s => withinDays(s.renewalAt, 90)).length,
    valuesAvailable: mrrValues.some(v => v !== null) || arrValues.some(v => v !== null),
  };
}
