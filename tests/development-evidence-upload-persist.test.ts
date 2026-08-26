/**
 * Upload route → storage-path validation → persist → extraction → analyse
 * hand-off, including the Development Evidence reliability matrix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  analyseEvidenceDocument,
  hasUsableAnalysisObservations,
  parseDevelopmentEvidenceStoragePath,
} from "@/lib/development-evidence";
import { MANAGER_EVIDENCE_UPLOAD_ERROR } from "@/lib/development-evidence/storage-path";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const USER_A = "33333333-3333-4333-8333-333333333333";

const SAMPLE_TEXT =
  "Stakeholder feedback: clearer expectations and calmer pacing were observed in recent reviews.";

type Row = Record<string, unknown>;

const {
  buildPathState,
  requireAssignedPersonInOrganisation,
  uploadedPaths,
  uploadMock,
  removeMock,
} = vi.hoisted(() => {
  const uploadedPaths: string[] = [];
  return {
    buildPathState: {
      override: null as
        | ((input: {
            organisationId: string | null | undefined;
            clientId: string;
            contentHash: string;
            fileName: string;
          }) => string)
        | null,
    },
    requireAssignedPersonInOrganisation: vi.fn(),
    uploadedPaths,
    uploadMock: vi.fn(
      async (storagePath: string, _bytes: Uint8Array, _options?: unknown) => {
        uploadedPaths.push(storagePath);
        return { error: null };
      }
    ),
    removeMock: vi.fn(async (_paths: string[]) => ({ error: null })),
  };
});

vi.mock("@/lib/organisations/person-access-gate", () => ({
  requireAssignedPersonInOrganisation: (
    ...args: unknown[]
  ) => requireAssignedPersonInOrganisation(...args),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  getSupabaseServiceClient: () => ({
    storage: {
      from: () => ({
        upload: (
          storagePath: string,
          bytes: Uint8Array,
          options?: unknown
        ) => uploadMock(storagePath, bytes, options),
        remove: (paths: string[]) => removeMock(paths),
      }),
    },
  }),
}));

vi.mock("@/lib/development-evidence", async importOriginal => {
  const actual =
    await importOriginal<typeof import("@/lib/development-evidence")>();
  return {
    ...actual,
    buildDevelopmentEvidenceStoragePath: (
      input: Parameters<typeof actual.buildDevelopmentEvidenceStoragePath>[0]
    ) =>
      buildPathState.override
        ? buildPathState.override(input)
        : actual.buildDevelopmentEvidenceStoragePath(input),
  };
});

function createMemorySupabase(clientRow: Row) {
  const tables: Record<string, Row[]> = {
    clients: [clientRow],
    development_evidence: [],
    development_evidence_documents: [],
    development_evidence_observations: [],
    development_evidence_links: [],
    development_evidence_audit_log: [],
  };

  function applyFilters(
    rows: Row[],
    filters: Array<{ kind: "eq" | "is"; column: string; value: unknown }>
  ): Row[] {
    return rows.filter(row =>
      filters.every(filter => {
        if (filter.kind === "eq") return row[filter.column] === filter.value;
        return row[filter.column] == null;
      })
    );
  }

  function from(table: string) {
    const state: {
      filters: Array<{ kind: "eq" | "is"; column: string; value: unknown }>;
      insertRows: Row[] | null;
      patch: Row | null;
      deleting: boolean;
    } = {
      filters: [],
      insertRows: null,
      patch: null,
      deleting: false,
    };

    async function execute(
      mode: "many" | "single" | "maybeSingle"
    ): Promise<{ data: unknown; error: { message: string } | null }> {
      const rows = tables[table] ?? [];
      if (state.insertRows) {
        const created: Row[] = state.insertRows.map(row => ({
          id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          captured_at: row.captured_at ?? new Date().toISOString(),
          ...row,
        }));
        tables[table].push(...created);
        if (mode === "many") return { data: created, error: null };
        return {
          data: created[0] ?? null,
          error: created[0] ? null : { message: "not found" },
        };
      }

      const matched = applyFilters(rows, state.filters);
      if (state.patch) {
        for (const row of matched) Object.assign(row, state.patch);
        if (mode === "many") return { data: matched, error: null };
        return {
          data: matched[0] ?? null,
          error: matched[0] ? null : { message: "not found" },
        };
      }
      if (state.deleting) {
        tables[table] = rows.filter(row => !matched.includes(row));
        return { data: matched, error: null };
      }
      if (mode === "maybeSingle") {
        return { data: matched[0] ?? null, error: null };
      }
      if (mode === "single") {
        return {
          data: matched[0] ?? null,
          error: matched[0] ? null : { message: "not found" },
        };
      }
      return { data: matched, error: null };
    }

    const builder = {
      select: (_columns?: string) => builder,
      insert: (row: Row | Row[]) => {
        state.insertRows = Array.isArray(row) ? row : [row];
        return builder;
      },
      update: (patch: Row) => {
        state.patch = patch;
        return builder;
      },
      delete: () => {
        state.deleting = true;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        state.filters.push({ kind: "eq", column, value });
        return builder;
      },
      is: (column: string, value: unknown) => {
        state.filters.push({ kind: "is", column, value });
        return builder;
      },
      order: (..._args: unknown[]) => builder,
      maybeSingle: () => execute("maybeSingle"),
      single: () => execute("single"),
      then: (
        resolve: (value: { data: unknown; error: { message: string } | null }) => unknown,
        reject?: (reason: unknown) => unknown
      ) => execute("many").then(resolve, reject),
    };

    return builder;
  }

  return { from, tables };
}

function buildMinimalDocx(bodyText: string): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p></w:body>
</w:document>`;
  const uncompressed = Buffer.from(xml, "utf8");
  const payload = deflateRawSync(uncompressed);
  const name = Buffer.from("word/document.xml", "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(payload.length, 18);
  header.writeUInt32LE(uncompressed.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return new Uint8Array(Buffer.concat([header, name, payload]));
}

function buildExtractablePdf(bodyText: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\nBT (${bodyText}) Tj ET\n`);
}

function stubAccess(supabase: ReturnType<typeof createMemorySupabase>) {
  requireAssignedPersonInOrganisation.mockResolvedValue({
    ok: true,
    context: {
      user: { id: USER_A },
      supabase,
      organisation: {
        organisationId: ORG_A,
        role: "practitioner",
        organisation: { aiEnabled: true },
      },
    },
    clientId: CLIENT_A,
  });
}

async function postUpload(input: {
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
  organisationId: string | null;
}) {
  const supabase = createMemorySupabase({
    id: CLIENT_A,
    organisation_id: input.organisationId,
    identity_mode: "standard",
    name: "Alex",
  });
  stubAccess(supabase);
  const { POST } = await import(
    "@/app/api/development-evidence/[clientId]/upload/route"
  );
  const form = new FormData();
  form.set(
    "file",
    new File([input.bytes as BlobPart], input.fileName, {
      type: input.mimeType,
    })
  );
  form.set("evidenceType", "feedback_360");
  form.set("title", input.fileName);
  form.set("purpose", "Support development planning after a recent 360.");
  const response = await POST(new Request("http://localhost/upload", {
    method: "POST",
    body: form,
  }), { params: Promise.resolve({ clientId: CLIENT_A }) });
  const json = (await response.json()) as {
    error?: string;
    evidence?: { id: string; processingStatus?: string };
    document?: { extractionStatus?: string };
    needsManualText?: boolean;
  };
  return { response, json, supabase };
}

const previousOpenAiKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  uploadedPaths.length = 0;
  uploadMock.mockClear();
  removeMock.mockClear();
  requireAssignedPersonInOrganisation.mockReset();
  buildPathState.override = null;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAiKey;
});

describe("Development Evidence upload persist hand-off", () => {
  it("validates the storage path before upload and persists a parser-valid key", async () => {
    const { response, json, supabase } = await postUpload({
      fileName: "Alex feedback.txt",
      bytes: new TextEncoder().encode(SAMPLE_TEXT),
      mimeType: "text/plain",
      organisationId: ORG_A,
    });

    expect(response.status).toBe(201);
    expect(json.needsManualText).toBeUndefined();
    expect(json.evidence?.id).toBeTruthy();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadedPaths).toHaveLength(1);
    const storagePath = uploadedPaths[0];
    const parsed = parseDevelopmentEvidenceStoragePath(storagePath);
    expect(parsed).toEqual({
      organisationSegment: ORG_A,
      clientId: CLIENT_A,
      objectName: expect.stringMatching(/^[0-9a-f]{16}-Alex_feedback\.txt$/i),
    });

    const documents = supabase.tables.development_evidence_documents;
    expect(documents).toHaveLength(1);
    expect(documents[0].storage_path).toBe(storagePath);
    expect(documents[0].extraction_status).toBe("extracted");
    expect(String(documents[0].extracted_text)).toContain("clearer expectations");
    expect(supabase.tables.development_evidence).toHaveLength(1);
    expect(supabase.tables.development_evidence[0].processing_status).toBe(
      "extracted"
    );

    const analysed = await analyseEvidenceDocument({
      supabase: supabase as never,
      userId: USER_A,
      evidenceId: json.evidence!.id,
      client: { name: "Alex" },
      privateIdentity: null,
    });
    expect(hasUsableAnalysisObservations(analysed.structured)).toBe(true);
  });

  it("never uploads an invalid path, so no orphan object is created", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    buildPathState.override = () =>
      `${ORG_A}/${CLIENT_A}/abcdef0123456789-../x.docx`;

    const { response, json, supabase } = await postUpload({
      fileName: "notes.txt",
      bytes: new TextEncoder().encode(SAMPLE_TEXT),
      mimeType: "text/plain",
      organisationId: ORG_A,
    });

    expect(response.status).toBe(500);
    expect(json.error).toBe(MANAGER_EVIDENCE_UPLOAD_ERROR);
    expect(json.error).not.toMatch(/Invalid development evidence storage path/i);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(uploadedPaths).toHaveLength(0);
    expect(removeMock).not.toHaveBeenCalled();
    expect(supabase.tables.development_evidence_documents).toHaveLength(0);
    expect(supabase.tables.development_evidence).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[1] ?? "")).toMatch(
      /Invalid development evidence storage path/i
    );
    errorSpy.mockRestore();
  });
});

describe("Development Evidence reliability matrix", () => {
  const matrix: Array<{
    name: string;
    fileName: string;
    mimeType: string;
    organisationId: string | null;
    bytes: Uint8Array;
  }> = [
    {
      name: "DOCX ordinary filename",
      fileName: "feedback.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      organisationId: ORG_A,
      bytes: buildMinimalDocx(SAMPLE_TEXT),
    },
    {
      name: "PDF ordinary filename",
      fileName: "feedback.pdf",
      mimeType: "application/pdf",
      organisationId: ORG_A,
      bytes: buildExtractablePdf(SAMPLE_TEXT),
    },
    {
      name: "TXT ordinary filename",
      fileName: "notes.txt",
      mimeType: "text/plain",
      organisationId: ORG_A,
      bytes: new TextEncoder().encode(SAMPLE_TEXT),
    },
    {
      name: "filename containing spaces",
      fileName: "Alex feedback.txt",
      mimeType: "text/plain",
      organisationId: ORG_A,
      bytes: new TextEncoder().encode(`${SAMPLE_TEXT} Spaces.`),
    },
    {
      name: "safe punctuation and multiple dots",
      fileName: "file.v1.2.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      organisationId: ORG_A,
      bytes: buildMinimalDocx(`${SAMPLE_TEXT} Versioned.`),
    },
    {
      name: "personal-scoped TXT",
      fileName: "personal-notes.txt",
      mimeType: "text/plain",
      organisationId: null,
      bytes: new TextEncoder().encode(`${SAMPLE_TEXT} Personal.`),
    },
    {
      name: "canonicalised ../x.docx",
      fileName: "../x.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      organisationId: ORG_A,
      bytes: buildMinimalDocx(`${SAMPLE_TEXT} Traversal name.`),
    },
    {
      name: "canonicalised ..\\x.docx",
      fileName: "..\\x.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      organisationId: ORG_A,
      bytes: buildMinimalDocx(`${SAMPLE_TEXT} Windows traversal name.`),
    },
    {
      name: "canonicalised report..final.docx",
      fileName: "report..final.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      organisationId: ORG_A,
      bytes: buildMinimalDocx(`${SAMPLE_TEXT} Double-dot name.`),
    },
    {
      name: "canonicalised foo/bar.docx",
      fileName: "foo/bar.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      organisationId: ORG_A,
      bytes: buildMinimalDocx(`${SAMPLE_TEXT} Nested name.`),
    },
  ];

  it.each(matrix)(
    "$name progresses upload → persist → extraction → analysis",
    async row => {
      const { response, json, supabase } = await postUpload({
        fileName: row.fileName,
        bytes: row.bytes,
        mimeType: row.mimeType,
        organisationId: row.organisationId,
      });

      expect(response.status).toBe(201);
      expect(json.needsManualText).not.toBe(true);
      expect(json.document?.extractionStatus).toBe("extracted");
      expect(json.evidence?.processingStatus).toBe("extracted");
      expect(uploadedPaths).toHaveLength(1);
      const parsed = parseDevelopmentEvidenceStoragePath(uploadedPaths[0]);
      expect(parsed).not.toBeNull();
      expect(parsed?.clientId).toBe(CLIENT_A);
      expect(parsed?.organisationSegment).toBe(
        row.organisationId ?? "personal"
      );
      expect(uploadedPaths[0]).not.toContain("..");
      expect(supabase.tables.development_evidence_documents[0].storage_path).toBe(
        uploadedPaths[0]
      );

      const analysed = await analyseEvidenceDocument({
        supabase: supabase as never,
        userId: USER_A,
        evidenceId: json.evidence!.id,
        client: { name: "Alex" },
        privateIdentity: null,
      });
      expect(hasUsableAnalysisObservations(analysed.structured)).toBe(true);
      expect(analysed.reusedExistingAnalysis).toBe(false);
    }
  );

  it("repeated uploads each persist, extract, and hand off to analysis", async () => {
    for (let index = 1; index <= 2; index += 1) {
      uploadedPaths.length = 0;
      const { response, json, supabase } = await postUpload({
        fileName: "repeat-notes.txt",
        bytes: new TextEncoder().encode(`${SAMPLE_TEXT} Repeat ${index}.`),
        mimeType: "text/plain",
        organisationId: ORG_A,
      });
      expect(response.status).toBe(201);
      expect(json.document?.extractionStatus).toBe("extracted");
      const analysed = await analyseEvidenceDocument({
        supabase: supabase as never,
        userId: USER_A,
        evidenceId: json.evidence!.id,
        client: { name: "Alex" },
        privateIdentity: null,
      });
      expect(hasUsableAnalysisObservations(analysed.structured)).toBe(true);
    }
  });
});
