/**
 * Pridmora Owner Console types.
 * platform_owner is a platform-level role — not an organisation membership role.
 */

export const PLATFORM_OWNER_STATUS = ["active", "suspended"] as const;
export type PlatformOwnerStatus = (typeof PLATFORM_OWNER_STATUS)[number];

export const SUBSCRIPTION_STATUSES = [
  "trial",
  "active",
  "past_due",
  "paused",
  "cancelled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "paid",
  "part_paid",
  "overdue",
  "void",
  "refunded",
  "credited",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHOD_TYPES = [
  "card",
  "direct_debit",
  "bank_transfer",
  "purchase_order",
] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const PURCHASE_ORDER_STATUSES = [
  "active",
  "expiring",
  "expired",
  "fully_used",
  "cancelled",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const CONTRACT_STATUSES = [
  "draft",
  "active",
  "renewal_due",
  "expired",
  "terminated",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const TRIAL_CONVERSION_STATUSES = [
  "new",
  "engaging",
  "review_required",
  "conversion_discussion",
  "converted",
  "not_converted",
] as const;
export type TrialConversionStatus = (typeof TRIAL_CONVERSION_STATUSES)[number];

export const SUPPORT_CATEGORIES = [
  "access",
  "account",
  "billing",
  "technical",
  "ai",
  "data",
  "feature_request",
  "other",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const CUSTOMER_HEALTH_LEVELS = [
  "healthy",
  "watch",
  "needs_attention",
] as const;
export type CustomerHealthLevel = (typeof CUSTOMER_HEALTH_LEVELS)[number];

export const ACCOUNT_STATUSES = [
  "active",
  "trial",
  "suspended",
  "cancelled",
  "expired",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type CustomerHealth = {
  level: CustomerHealthLevel;
  label: string;
  reasons: string[];
};

export type OrganisationUsageCounts = {
  managersInvited: number;
  managersActivated: number;
  teamMembers: number;
  activeMembers: number;
  activeUsers30d: number;
  conversationsCompleted30d: number;
  conversationsCompletedTotal: number;
  preparationsGenerated30d: number;
  preparationsGeneratedTotal: number;
  aiRequests30d: number;
  lastActivityAt: string | null;
};

export type PlatformUsageTotals = {
  activeOrganisations: number;
  trialOrganisations: number;
  totalManagers: number;
  totalTeamMembers: number;
  activeUsers30d: number;
  conversations30d: number;
  aiRequests30d: number;
};

export type PlatformPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billingFrequency: "monthly" | "annual" | "custom";
  currency: string;
  unitAmountMinor: number | null;
  seatsIncluded: number | null;
  isActive: boolean;
  sortOrder: number;
};

export type OrganisationSubscription = {
  id: string;
  organisationId: string;
  planId: string | null;
  planCode: string;
  seats: number;
  billingFrequency: "monthly" | "annual" | "custom";
  status: SubscriptionStatus;
  currency: string;
  monthlyValueMinor: number | null;
  annualValueMinor: number | null;
  startsAt: string | null;
  renewalAt: string | null;
  trialEndsAt: string | null;
  cancelledAt: string | null;
  externalProvider: string | null;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
};

export type Invoice = {
  id: string;
  organisationId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  currency: string;
  status: InvoiceStatus;
  paymentDate: string | null;
  paymentMethodId: string | null;
  purchaseOrderReference: string | null;
  externalProvider: string | null;
  externalInvoiceId: string | null;
  documentReference: string | null;
};

export type OrganisationPaymentMethod = {
  id: string;
  organisationId: string;
  methodType: PaymentMethodType;
  provider: string | null;
  providerCustomerId: string | null;
  providerPaymentMethodId: string | null;
  brand: string | null;
  lastFour: string | null;
  expMonth: number | null;
  expYear: number | null;
  billingName: string | null;
  maskedDescriptor: string;
  isDefault: boolean;
  status: string;
  createdAt: string;
};

export type PurchaseOrder = {
  id: string;
  organisationId: string;
  poNumber: string;
  description: string | null;
  approvedValueMinor: number;
  currency: string;
  startsAt: string | null;
  expiresAt: string | null;
  amountInvoicedMinor: number;
  remainingBalanceMinor: number;
  status: PurchaseOrderStatus;
  documentReference: string | null;
  warnings: string[];
};

export type OrganisationContract = {
  id: string;
  organisationId: string;
  name: string;
  reference: string | null;
  startsAt: string | null;
  endsAt: string | null;
  noticePeriodDays: number | null;
  renewalType: string;
  contractValueMinor: number | null;
  currency: string;
  accountOwner: string | null;
  status: ContractStatus;
  documentReference: string | null;
  notes: string | null;
};

export type OrganisationTrial = {
  id: string;
  organisationId: string;
  trialStartsAt: string;
  trialEndsAt: string;
  durationDays: number;
  conversionStatus: TrialConversionStatus;
  followUpAt: string | null;
  notes: string | null;
};

export type SupportCase = {
  id: string;
  organisationId: string | null;
  userId: string | null;
  category: SupportCategory;
  subject: string;
  description: string;
  status: SupportStatus;
  priority: SupportPriority;
  assignedTo: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformAuditEvent = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  organisationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type OwnerOrganisationListItem = {
  id: string;
  name: string;
  legalName: string | null;
  tradingName: string | null;
  sector: string | null;
  companySize: string | null;
  organisationType: string;
  accountStatus: AccountStatus;
  planName: string;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  managers: number;
  teamMembers: number;
  health: CustomerHealth;
  renewalOrTrialDate: string | null;
  lastActivityAt: string | null;
};

export type OwnerUserListItem = {
  membershipId: string;
  userId: string;
  organisationId: string;
  organisationName: string;
  role: string;
  professionalRole: string | null;
  status: string;
  fullName: string;
  email: string;
  lastActiveAt: string | null;
  joinedAt: string | null;
  invitedAt: string | null;
  createdAt: string;
  invitationStatus: string;
};

export const CUSTOMER_HEALTH_LABELS: Record<CustomerHealthLevel, string> = {
  healthy: "Healthy",
  watch: "Watch",
  needs_attention: "Needs Attention",
};

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  trial: "Trial",
  suspended: "Suspended",
  cancelled: "Cancelled",
  expired: "Expired",
};
