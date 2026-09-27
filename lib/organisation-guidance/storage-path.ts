const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OrganisationGuidanceStoragePathParts = {
  organisationId: string;
  documentId: string;
  objectName: string;
};

export function sanitizeOrganisationGuidanceFileName(fileName: string): string {
  const normalised = fileName.trim().replace(/\\/g, "/");
  const segments = normalised.split("/").filter(segment => segment.length > 0);
  const baseName = segments.at(-1) ?? "";

  let cleaned = baseName.replace(/[^\w.\-]+/g, "_");

  while (cleaned.includes("..")) {
    cleaned = cleaned.replaceAll("..", "_");
  }

  cleaned = cleaned.replace(/^\.+/, "").slice(0, 180);

  return cleaned || "guidance.bin";
}

export function buildOrganisationGuidanceStoragePath(input: {
  organisationId: string;
  documentId: string;
  contentHash: string;
  fileName: string;
}): string {
  const organisationId = input.organisationId.trim();
  const documentId = input.documentId.trim();

  if (!UUID_RE.test(organisationId)) {
    throw new Error("Invalid organisation id for guidance storage path.");
  }

  if (!UUID_RE.test(documentId)) {
    throw new Error("Invalid document id for guidance storage path.");
  }

  const hashPrefix = input.contentHash.trim().slice(0, 16);

  if (hashPrefix.length < 8) {
    throw new Error("Invalid content hash for guidance storage path.");
  }

  const safeName = sanitizeOrganisationGuidanceFileName(input.fileName);
  const storagePath =
    `${organisationId}/${documentId}/${hashPrefix}-${safeName}`;

  assertOrganisationGuidanceStoragePathMatches({
    storagePath,
    organisationId,
    documentId,
  });

  return storagePath;
}

export function parseOrganisationGuidanceStoragePath(
  storagePath: string | null | undefined
): OrganisationGuidanceStoragePathParts | null {
  const raw = (storagePath ?? "").trim();

  if (!raw || raw.includes("..") || raw.startsWith("/") || raw.includes("\\")) {
    return null;
  }

  const parts = raw.split("/").filter(Boolean);

  if (parts.length !== 3) return null;

  const [organisationId, documentId, objectName] = parts;

  if (!UUID_RE.test(organisationId) || !UUID_RE.test(documentId)) {
    return null;
  }

  if (!objectName || objectName.includes("/") || objectName.includes("..")) {
    return null;
  }

  return { organisationId, documentId, objectName };
}

export function assertOrganisationGuidanceStoragePathMatches(input: {
  storagePath: string;
  organisationId: string;
  documentId: string;
}): OrganisationGuidanceStoragePathParts {
  const parsed = parseOrganisationGuidanceStoragePath(input.storagePath);

  if (!parsed) {
    throw new Error("Invalid organisation guidance storage path.");
  }

  if (parsed.organisationId !== input.organisationId.trim()) {
    throw new Error("Storage path does not match authorised organisation.");
  }

  if (parsed.documentId !== input.documentId.trim()) {
    throw new Error("Storage path does not match authorised guidance document.");
  }

  return parsed;
}
