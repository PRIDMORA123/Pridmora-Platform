import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DEVELOPMENT_EVIDENCE_STORAGE_BUCKET,
  assertDevelopmentEvidenceStoragePathMatches,
  buildDevelopmentEvidenceStoragePath,
  organisationSegmentForEvidenceStorage,
  parseDevelopmentEvidenceStoragePath,
} from "@/lib/development-evidence/storage-path";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const HASH = "abcdef0123456789deadbeef";

describe("SEC-1 Development Evidence storage path model", () => {
  it("builds deterministic tenant-safe paths from server ownership", () => {
    const path = buildDevelopmentEvidenceStoragePath({
      organisationId: ORG_A,
      clientId: CLIENT_A,
      contentHash: HASH,
      fileName: "Alex feedback.docx",
    });
    expect(path).toBe(
      `${ORG_A}/${CLIENT_A}/abcdef0123456789-Alex_feedback.docx`
    );
    expect(parseDevelopmentEvidenceStoragePath(path)).toEqual({
      organisationSegment: ORG_A,
      clientId: CLIENT_A,
      objectName: "abcdef0123456789-Alex_feedback.docx",
    });
  });

  it("uses personal segment when organisation is null", () => {
    expect(organisationSegmentForEvidenceStorage(null)).toBe("personal");
    const path = buildDevelopmentEvidenceStoragePath({
      organisationId: null,
      clientId: CLIENT_A,
      contentHash: HASH,
      fileName: "notes.txt",
    });
    expect(path.startsWith("personal/")).toBe(true);
  });

  it("rejects traversal, wrong shape, and foreign ownership assertions", () => {
    expect(parseDevelopmentEvidenceStoragePath("../etc/passwd")).toBeNull();
    expect(parseDevelopmentEvidenceStoragePath(`${ORG_A}/${CLIENT_A}`)).toBeNull();
    expect(
      parseDevelopmentEvidenceStoragePath(
        `${ORG_A}/${CLIENT_A}/extra/file.txt`
      )
    ).toBeNull();

    const foreignPath = buildDevelopmentEvidenceStoragePath({
      organisationId: ORG_B,
      clientId: CLIENT_B,
      contentHash: HASH,
      fileName: "secret.pdf",
    });

    expect(() =>
      assertDevelopmentEvidenceStoragePathMatches({
        storagePath: foreignPath,
        organisationId: ORG_A,
        clientId: CLIENT_A,
      })
    ).toThrow(/does not match authorised/);

    expect(() =>
      assertDevelopmentEvidenceStoragePathMatches({
        storagePath: `${ORG_A}/${CLIENT_B}/abcdef0123456789-x.pdf`,
        organisationId: ORG_A,
        clientId: CLIENT_A,
      })
    ).toThrow(/relationship/);
  });
});

describe("SEC-1 storage RLS migration", () => {
  const migration = read(
    "supabase/migrations/20260817120000_development_evidence_storage_tenancy.sql"
  );
  const original = read(
    "supabase/migrations/20260807140000_development_evidence.sql"
  );

  it("replaces bucket-wide authenticated policies with path-scoped access", () => {
    // Original weakness (documentation of root cause).
    expect(original).toContain("auth.role() = 'authenticated'");

    expect(migration).toContain(
      "user_can_access_development_evidence_object"
    );
    expect(migration).toContain(
      "user_can_access_client_content(v_client_id, auth.uid())"
    );
    expect(migration).toContain("client_belongs_to_organisation");
    expect(migration).toContain("v_org_segment = 'personal'");

    for (const op of ["select", "insert", "update", "delete"] as const) {
      expect(migration).toContain(
        `create policy development_evidence_storage_${op} on storage.objects`
      );
      expect(migration).toMatch(
        new RegExp(
          `development_evidence_storage_${op}[\\s\\S]*user_can_access_development_evidence_object\\(name\\)`
        )
      );
    }

    // Must not leave a bucket-wide authenticated open door in the new migration.
    expect(migration).not.toMatch(
      /bucket_id = 'development-evidence'\s+and\s+auth\.role\(\) = 'authenticated'/
    );
  });

  it("rejects unauthenticated callers in the helper", () => {
    expect(migration).toContain("if auth.uid() is null then");
    expect(migration).toContain("return false");
  });
});

describe("SEC-1 storage write lockdown migration", () => {
  const lockdown = read(
    "supabase/migrations/20260820170345_development_evidence_storage_write_lockdown_fix.sql"
  );

  it("denies authenticated INSERT and UPDATE without reopening bucket-wide access", () => {
    expect(lockdown).toContain("set public = false");
    expect(lockdown).toContain("where id = 'development-evidence'");
    expect(lockdown).toMatch(
      /development_evidence_storage_insert[\s\S]*for insert[\s\S]*to authenticated[\s\S]*with check \(false\)/
    );
    expect(lockdown).toMatch(
      /development_evidence_storage_update[\s\S]*for update[\s\S]*to authenticated[\s\S]*using \(false\)[\s\S]*with check \(false\)/
    );
    expect(lockdown).not.toMatch(
      /bucket_id = 'development-evidence'\s+and\s+auth\.role\(\) = 'authenticated'/
    );
  });
});

describe("SEC-1 application / API enforcement", () => {
  const uploadRoute = read(
    "app/api/development-evidence/[clientId]/upload/route.ts"
  );
  const fileRoute = read(
    "app/api/development-evidence/item/[evidenceId]/file/route.ts"
  );
  const itemRoute = read(
    "app/api/development-evidence/item/[evidenceId]/route.ts"
  );
  const repository = read("lib/development-evidence/repository.ts");
  const env = read("lib/supabase/env.ts");

  it("A/K: upload builds path server-side and rejects client ownership fields", () => {
    expect(uploadRoute).toContain("buildDevelopmentEvidenceStoragePath");
    expect(uploadRoute).toContain("requireAssignedPersonInOrganisation");
    expect(uploadRoute).toContain('form.has("storagePath")');
    expect(uploadRoute).toContain('form.has("organisationId")');
    expect(uploadRoute).toContain(
      "Storage ownership fields cannot be supplied by the client"
    );
    expect(uploadRoute).toContain("DEVELOPMENT_EVIDENCE_STORAGE_BUCKET");
    expect(uploadRoute).not.toMatch(
      /storagePath\s*=\s*`\$\{organisationId\}\/\$\{clientId\}/
    );
  });

  it("L/M/N: signed URL route authorises then signs trusted DB path only", () => {
    expect(fileRoute).toContain("getEvidenceById");
    expect(fileRoute).toContain("requireAssignedPersonInOrganisation");
    expect(fileRoute).toContain("assertDevelopmentEvidenceStoragePathMatches");
    expect(fileRoute).toContain("createSignedUrl");
    expect(fileRoute).toContain("SIGNED_URL_EXPIRES_SECONDS = 60");
    expect(fileRoute).toContain("detail.document?.storagePath");
    expect(fileRoute).not.toContain("searchParams");
    expect(fileRoute).not.toMatch(/form\.get\(["']storagePath["']\)/);
  });

  it("C/D: delete verifies assignment then fail-closes if storage remove fails", () => {
    expect(itemRoute).toContain("softDeleteEvidence");
    expect(itemRoute).toContain("requireAssignedPersonInOrganisation");
    expect(repository).toContain("removeDevelopmentEvidenceStorageObject");
    expect(repository).toContain("assertDevelopmentEvidenceStoragePathMatches");
    expect(repository).toContain("Evidence storage object delete failed:");
    expect(repository).toMatch(
      /if \(!removal\.removed\)[\s\S]*throw new Error/
    );
    expect(repository).toMatch(
      /storagePathRemoved = true[\s\S]*storage_path: null/
    );
  });

  it("J: createUploadedEvidence rejects mismatched storage paths", () => {
    expect(repository).toContain("assertDevelopmentEvidenceStoragePathMatches");
    expect(repository).toMatch(
      /createUploadedEvidence[\s\S]*assertDevelopmentEvidenceStoragePathMatches/
    );
  });

  it("O: service_role is server-only; used only for authorised Storage writes", () => {
    expect(env).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(env).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE");
    expect(uploadRoute).toContain("getSupabaseServiceClient");
    expect(uploadRoute).toContain("await uploadAuthorisedEvidenceObject");
    expect(uploadRoute).not.toContain("startAuthorisedStorageUpload");
    expect(fileRoute).not.toContain("getSupabaseServiceRoleKey");
    expect(fileRoute).not.toContain("getSupabaseServiceClient");

    // Client bundles must not reference the service role secret name.
    const clientFiles = [
      "components/development-evidence/development-evidence-view.tsx",
      "lib/supabase/browser.ts",
      "lib/supabase/client.ts",
    ].filter(relative => existsSync(join(root, relative)));

    for (const relative of clientFiles) {
      const source = read(relative);
      expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source).not.toContain("getSupabaseServiceRoleKey");
    }
  });

  it("P: legitimate upload → list/delete wiring remains intact", () => {
    expect(uploadRoute).toContain("createUploadedEvidence");
    expect(itemRoute).toContain("toEvidenceListItem");
    expect(itemRoute).toContain("softDeleteEvidence");
    expect(existsSync(join(root, "components/development-evidence/development-evidence-view.tsx"))).toBe(
      true
    );
  });
});

describe("SEC-1 security matrix source evidence", () => {
  it("documents denial paths for foreign UUID, guessed path, and unauthenticated", () => {
    const fileRoute = read(
      "app/api/development-evidence/item/[evidenceId]/file/route.ts"
    );
    const migration = read(
      "supabase/migrations/20260817120000_development_evidence_storage_tenancy.sql"
    );

    // Foreign UUID / not assigned → getEvidenceById or assignment gate.
    expect(fileRoute).toContain("notFoundOrForbidden");
    expect(fileRoute).toContain("requireAssignedPersonInOrganisation");

    // Guessed path without client access → storage helper false.
    expect(migration).toContain(
      "user_can_access_client_content(v_client_id, auth.uid())"
    );

    // Unauthenticated → auth.uid() null.
    expect(migration).toContain("if auth.uid() is null then");
  });

  it("ensures no later migration reopens bucket-wide development-evidence policies", () => {
    const migrationsDir = join(root, "supabase/migrations");
    const files = readdirSync(migrationsDir)
      .filter(name => name.endsWith(".sql"))
      .sort();
    const after = files.filter(
      name => name > "20260817120000_development_evidence_storage_tenancy.sql"
    );
    for (const name of after) {
      const sql = read(`supabase/migrations/${name}`);
      if (!sql.includes("development-evidence")) continue;
      expect(sql).not.toMatch(
        /bucket_id = 'development-evidence'\s+and\s+auth\.role\(\) = 'authenticated'/
      );
    }
  });

  it("exports path helpers from the development-evidence package", () => {
    const index = read("lib/development-evidence/index.ts");
    expect(index).toContain('export * from "@/lib/development-evidence/storage-path"');
    expect(index).toContain("removeDevelopmentEvidenceStorageObject");
    expect(DEVELOPMENT_EVIDENCE_STORAGE_BUCKET).toBe("development-evidence");
  });
});
