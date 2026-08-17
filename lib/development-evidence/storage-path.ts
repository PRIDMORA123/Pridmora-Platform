/**
 * Deterministic Development Evidence storage paths for tenant isolation.
 * Ownership identifiers are always server-derived — never trust client paths.
 *
 * Format: {organisationId|personal}/{clientId}/{hashPrefix}-{safeFileName}
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEVELOPMENT_EVIDENCE_STORAGE_BUCKET = "development-evidence";

export type DevelopmentEvidenceStoragePathParts = {
  organisationSegment: string;
  clientId: string;
  objectName: string;
};

export function organisationSegmentForEvidenceStorage(
  organisationId: string | null | undefined
): string {
  const trimmed = organisationId?.trim() ?? "";
  return trimmed && UUID_RE.test(trimmed) ? trimmed : "personal";
}

export function sanitizeEvidenceStorageFileName(fileName: string): string {
  const base = fileName.trim().replace(/[^\w.\-]+/g, "_");
  const cleaned = base.replace(/^\.+/, "").slice(0, 180);
  return cleaned || "evidence.bin";
}

/**
 * Build a storage object path from server-validated ownership only.
 */
export function buildDevelopmentEvidenceStoragePath(input: {
  organisationId: string | null | undefined;
  clientId: string;
  contentHash: string;
  fileName: string;
}): string {
  const clientId = input.clientId.trim();
  if (!UUID_RE.test(clientId)) {
    throw new Error("Invalid client id for evidence storage path.");
  }
  const hashPrefix = input.contentHash.trim().slice(0, 16);
  if (hashPrefix.length < 8) {
    throw new Error("Invalid content hash for evidence storage path.");
  }
  const organisationSegment = organisationSegmentForEvidenceStorage(
    input.organisationId
  );
  const safeName = sanitizeEvidenceStorageFileName(input.fileName);
  return `${organisationSegment}/${clientId}/${hashPrefix}-${safeName}`;
}

/**
 * Parse and validate a storage object path shape.
 * Returns null when the path is not a trusted Development Evidence namespace.
 */
export function parseDevelopmentEvidenceStoragePath(
  storagePath: string | null | undefined
): DevelopmentEvidenceStoragePathParts | null {
  const raw = (storagePath ?? "").trim();
  if (!raw || raw.includes("..") || raw.startsWith("/") || raw.includes("\\")) {
    return null;
  }
  const parts = raw.split("/").filter(Boolean);
  if (parts.length !== 3) return null;

  const [organisationSegment, clientId, objectName] = parts;
  if (!organisationSegment || !objectName) return null;
  if (organisationSegment !== "personal" && !UUID_RE.test(organisationSegment)) {
    return null;
  }
  if (!UUID_RE.test(clientId)) return null;
  if (objectName.includes("/") || objectName.includes("..")) return null;

  return { organisationSegment, clientId, objectName };
}

/**
 * Confirm a path belongs to the authorised organisation + client pair.
 */
export function assertDevelopmentEvidenceStoragePathMatches(input: {
  storagePath: string;
  organisationId: string | null | undefined;
  clientId: string;
}): DevelopmentEvidenceStoragePathParts {
  const parsed = parseDevelopmentEvidenceStoragePath(input.storagePath);
  if (!parsed) {
    throw new Error("Invalid development evidence storage path.");
  }
  if (parsed.clientId !== input.clientId.trim()) {
    throw new Error("Storage path does not match authorised relationship.");
  }
  const expectedOrg = organisationSegmentForEvidenceStorage(input.organisationId);
  if (parsed.organisationSegment !== expectedOrg) {
    throw new Error("Storage path does not match authorised organisation.");
  }
  return parsed;
}
