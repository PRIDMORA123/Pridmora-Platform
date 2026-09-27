const MAX_ORGANISATION_GUIDANCE_UPLOAD_BYTES = 10 * 1024 * 1024;

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const ORGANISATION_GUIDANCE_STORAGE_BUCKET = "organisation-guidance";

export function validateOrganisationGuidanceUpload(input: {
  fileName: string;
  mimeType: string;
  byteSize: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.byteSize <= 0) {
    return { ok: false, error: "The selected file is empty." };
  }

  if (input.byteSize > MAX_ORGANISATION_GUIDANCE_UPLOAD_BYTES) {
    return {
      ok: false,
      error: "The file is too large. Upload a PDF or DOCX up to 10 MB.",
    };
  }

  const fileName = input.fileName.trim().toLowerCase();
  const mimeType = input.mimeType.trim().toLowerCase();

  const isPdf = fileName.endsWith(".pdf") && mimeType === PDF_MIME;
  const isDocx = fileName.endsWith(".docx") && mimeType === DOCX_MIME;

  if (!isPdf && !isDocx) {
    return {
      ok: false,
      error: "Upload an approved PDF or DOCX document.",
    };
  }

  return { ok: true };
}
