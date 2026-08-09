/**
 * Document extraction for Development Evidence uploads.
 * Supports plain text natively. PDF/DOCX: best-effort text extraction
 * without OCR. No formal assessment-provider integrations.
 *
 * Binary extractors must stay bounded — sync full-file scans can freeze
 * the Node event loop and prevent evidence rows from being created.
 */

import {
  MAX_UPLOAD_BYTES,
  SUPPORTED_UPLOAD_EXTENSIONS,
  SUPPORTED_UPLOAD_MIME_TYPES,
} from "@/lib/development-evidence/constants";

/** Max bytes scanned for sync PDF/DOCX best-effort extraction. */
export const EXTRACT_BINARY_SCAN_BYTES = 384 * 1024;
const MAX_PDF_TEXT_BLOCKS = 250;

export type ExtractionResult =
  | {
      ok: true;
      text: string;
      method: "plain_text" | "pdf_text" | "docx_text" | "utf8_fallback";
      status: "extracted";
    }
  | {
      ok: false;
      error: string;
      status: "failed" | "unsupported";
      method: "none";
    };

export function isSupportedEvidenceUpload(input: {
  fileName: string;
  mimeType: string;
  byteSize: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.byteSize <= 0) {
    return { ok: false, error: "The uploaded file is empty." };
  }
  if (input.byteSize > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: "Files larger than 10 MB are not supported.",
    };
  }

  const lowerName = input.fileName.toLowerCase();
  const extensionOk = SUPPORTED_UPLOAD_EXTENSIONS.some(ext =>
    lowerName.endsWith(ext)
  );
  const mimeOk = (SUPPORTED_UPLOAD_MIME_TYPES as readonly string[]).includes(
    input.mimeType
  ) || input.mimeType === "application/octet-stream";

  if (!extensionOk && !mimeOk) {
    return {
      ok: false,
      error: "Unsupported file type. Upload PDF, DOCX or plain text.",
    };
  }

  return { ok: true };
}

function scanWindow(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength <= EXTRACT_BINARY_SCAN_BYTES) return bytes;
  return bytes.subarray(0, EXTRACT_BINARY_SCAN_BYTES);
}

export async function extractEvidenceDocumentText(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ExtractionResult> {
  const lower = input.fileName.toLowerCase();

  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    input.mimeType === "text/plain" ||
    input.mimeType === "text/markdown"
  ) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(input.bytes);
    if (!text.trim()) {
      return {
        ok: false,
        error: "The text file did not contain readable content.",
        status: "failed",
        method: "none",
      };
    }
    return {
      ok: true,
      text: text.slice(0, 200_000),
      method: "plain_text",
      status: "extracted",
    };
  }

  if (lower.endsWith(".pdf") || input.mimeType === "application/pdf") {
    const text = extractPdfTextBestEffort(scanWindow(input.bytes));
    if (!text.trim() || isUnusablePdfExtract(text)) {
      return {
        ok: false,
        error:
          "Could not extract readable text from this PDF (it may be scanned, image-only, or protected). Try a text-based PDF or paste a plain-text summary, then retry analysis.",
        status: "failed",
        method: "none",
      };
    }
    return {
      ok: true,
      text: text.slice(0, 200_000),
      method: "pdf_text",
      status: "extracted",
    };
  }

  if (
    lower.endsWith(".docx") ||
    input.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const text = extractDocxTextBestEffort(scanWindow(input.bytes));
    if (!text.trim()) {
      return {
        ok: false,
        error:
          "Could not extract text from this DOCX file. Try exporting as plain text.",
        status: "failed",
        method: "none",
      };
    }
    return {
      ok: true,
      text: text.slice(0, 200_000),
      method: "docx_text",
      status: "extracted",
    };
  }

  // Last resort for octet-stream text-like payloads
  const fallback = new TextDecoder("utf-8", { fatal: false }).decode(
    scanWindow(input.bytes)
  );
  if (fallback.trim() && !fallback.includes("\u0000")) {
    return {
      ok: true,
      text: fallback.slice(0, 200_000),
      method: "utf8_fallback",
      status: "extracted",
    };
  }

  return {
    ok: false,
    error: "Unsupported file type for extraction.",
    status: "unsupported",
    method: "none",
  };
}

export async function hashEvidenceBytes(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  // Deterministic fallback for non-subtle environments (tests)
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash * 31 + bytes[i]!) >>> 0;
  }
  return `fallback-${hash.toString(16)}-${bytes.length}`;
}

/**
 * Reject PDF "text" that is mostly structural/binary noise rather than
 * readable assessment content (common with encrypted or image-only PDFs).
 */
export function isUnusablePdfExtract(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (!sample.trim()) return true;

  const structuralHits =
    (sample.match(/%PDF-\d|endobj|endstream|\/Filter\s*\/Standard|\/Encrypt|xref/gi) ??
      []).length;
  if (structuralHits >= 3) return true;

  const letters = (sample.match(/[A-Za-z]/g) ?? []).length;
  const words = (sample.match(/[A-Za-z]{3,}/g) ?? []).length;
  if (sample.length > 200 && letters / sample.length < 0.35) return true;
  if (sample.length > 400 && words < 40) return true;

  return false;
}

/**
 * Best-effort PDF text extraction without OCR or external deps.
 * Reads literal strings from content streams — sufficient for many text PDFs.
 */
function extractPdfTextBestEffort(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  const chunks: string[] = [];

  const btPattern = /BT([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;
  let blocks = 0;
  while ((match = btPattern.exec(raw)) && blocks < MAX_PDF_TEXT_BLOCKS) {
    blocks += 1;
    const block = match[1] ?? "";
    const stringPattern = /\((?:\\.|[^\\)])*\)\s*Tj|\[(.*?)\]\s*TJ/g;
    let stringMatch: RegExpExecArray | null;
    while ((stringMatch = stringPattern.exec(block))) {
      if (stringMatch[0].includes("Tj")) {
        const inner = stringMatch[0].replace(/\s*Tj$/, "");
        chunks.push(unescapePdfString(inner.slice(1, -1)));
      } else if (stringMatch[1]) {
        const parts = stringMatch[1].match(/\((?:\\.|[^\\)])*\)/g) ?? [];
        for (const part of parts) {
          chunks.push(unescapePdfString(part.slice(1, -1)));
        }
      }
    }
  }

  // Fallback: harvest readable ASCII runs from the scanned window
  if (chunks.join("").trim().length < 40) {
    const ascii = raw
      .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return ascii.slice(0, 200_000);
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function unescapePdfString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

/**
 * Best-effort DOCX extraction: DOCX is a ZIP with word/document.xml.
 * Without a ZIP library, attempt to locate UTF-8 XML text payloads.
 */
function extractDocxTextBestEffort(bytes: Uint8Array): string {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const textChunks: string[] = [];
  const tagPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let match: RegExpExecArray | null;
  let tags = 0;
  while ((match = tagPattern.exec(raw)) && tags < 2_000) {
    tags += 1;
    if (match[1]) textChunks.push(decodeXml(match[1]));
  }

  if (textChunks.length > 0) {
    return textChunks.join(" ").replace(/\s+/g, " ").trim();
  }

  // Binary ZIP often breaks UTF-8 decoding of XML; scan for w:t fragments in latin1
  const latin = new TextDecoder("latin1").decode(bytes);
  const latinChunks: string[] = [];
  const latinPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  tags = 0;
  while ((match = latinPattern.exec(latin)) && tags < 2_000) {
    tags += 1;
    if (match[1]) latinChunks.push(decodeXml(match[1]));
  }
  return latinChunks.join(" ").replace(/\s+/g, " ").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
