import {
  extractEvidenceDocumentText,
  hashEvidenceBytes,
} from "@/lib/development-evidence/extract";

export { hashEvidenceBytes as hashOrganisationGuidanceBytes };

export async function extractOrganisationGuidanceText(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  return extractEvidenceDocumentText({
    fileName: input.fileName,
    mimeType: input.mimeType,
    bytes: input.bytes,
  });
}
