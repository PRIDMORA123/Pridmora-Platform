export const ORGANISATION_GUIDANCE_TYPES = [
  "policy",
  "values",
  "manager_guidance",
] as const;

export type OrganisationGuidanceType =
  (typeof ORGANISATION_GUIDANCE_TYPES)[number];

export const ORGANISATION_GUIDANCE_STATUSES = [
  "draft",
  "approved",
  "withdrawn",
] as const;

export type OrganisationGuidanceStatus =
  (typeof ORGANISATION_GUIDANCE_STATUSES)[number];

export type OrganisationGuidanceRecord = {
  id: string;
  organisationId: string;
  guidanceType: OrganisationGuidanceType;
  title: string;
  versionLabel: string | null;
  effectiveFrom: string | null;
  reviewDate: string | null;
  status: OrganisationGuidanceStatus;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  contentHash: string;
  storagePath: string;
  extractionMethod: string | null;
  uploadedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  withdrawnBy: string | null;
  withdrawnAt: string | null;
  replacesGuidanceId: string | null;
  createdAt: string;
  updatedAt: string;
};
