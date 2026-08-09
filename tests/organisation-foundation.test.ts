import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("organisation foundation source guards", () => {
  it("ships an organisation foundation migration", () => {
    const path = "supabase/migrations/20260802140000_organisation_foundation.sql";
    expect(existsSync(join(root, path))).toBe(true);
    const sql = read(path);
    expect(sql).toContain("create table if not exists public.organisations");
    expect(sql).toContain("organisation_memberships");
    expect(sql).toContain("organisation_invitations");
    expect(sql).toContain("relationship_assignments");
    expect(sql).toContain("ensure_personal_organisation");
    expect(sql).toContain("user_can_access_client_content");
    expect(sql).toContain("token_hash");
    expect(sql).not.toContain("plain_token");
  });

  it("keeps coach_id during transition", () => {
    const sql = read(
      "supabase/migrations/20260802140000_organisation_foundation.sql"
    );
    expect(sql).toMatch(/retain|transition|coach_id/i);
    expect(sql).not.toMatch(/drop column.*coach_id/i);
  });

  it("clients API uses organisation context and ignores browser organisation_id", () => {
    const route = read("app/api/clients/route.ts");
    expect(route).toContain("requireOrganisationContext");
    expect(route).toContain("Never trust browser-supplied organisation");
    expect(route).toContain("organisationId");
  });

  it("sessions API requires assignment, derives organisation_id, and redacts private notes", () => {
    const route = read("app/api/sessions/route.ts");
    expect(route).toContain("requireAssignedClientAccess");
    expect(route).toContain("redactPrivateNotesFields");
    expect(route).toContain("resolveSessionOrganisationId");
    expect(route).toContain("RELATIONSHIP_ORGANISATION_MISSING");
    expect(route).toContain("Never trust browser-supplied organisation");
  });

  it("preparation API enforces organisation AI policy and assignment", () => {
    const route = read("app/api/preparation/generate/route.ts");
    expect(route).toContain("requireOrganisationContext");
    expect(route).toContain("aiEnabled");
    expect(route).toContain("requireAssignedClientAccess");
  });

  it("notes AI and patterns routes enforce organisation assignment before OpenAI", () => {
    for (const path of [
      "app/api/draft-summary/route.ts",
      "app/api/coaching-questions/route.ts",
      "app/api/patterns/generate/route.ts",
    ]) {
      const route = read(path);
      expect(route).toContain("requireAssignedPersonInOrganisation");
      expect(route.indexOf("requireAssignedPersonInOrganisation")).toBeLessThan(
        route.indexOf("new OpenAI")
      );
    }
    expect(read("app/api/team-intelligence/route.ts")).toContain(
      "listAssignedClientIds"
    );
  });

  it("centralises permissions away from scattered role strings in org pages", () => {
    const permissions = read("lib/organisations/permissions.ts");
    expect(permissions).toContain("canAccessCoachingContent");
    expect(permissions).toContain("organisation.view_safe_oversight");
    expect(permissions).toContain("members.invite");
  });

  it("keeps organisation.created_by without ON DELETE so disposable cleanup must pre-delete personal orgs", () => {
    const sql = read(
      "supabase/migrations/20260802140000_organisation_foundation.sql"
    );
    expect(sql).toMatch(
      /created_by uuid not null references auth\.users\(id\)(,|\s)/
    );
    // Intentionally no ON DELETE CASCADE/SET NULL on created_by —
    // personal org rows block auth.users deletion until removed.
    const createdByLine = sql
      .split("\n")
      .find(line => /created_by uuid not null references auth\.users/.test(line));
    expect(createdByLine).toBeTruthy();
    expect(createdByLine!.toLowerCase()).not.toContain("on delete");
  });

  it("ships an organisation licence migration without billing automation", () => {
    const path = "supabase/migrations/20260802150000_organisation_licence.sql";
    expect(existsSync(join(root, path))).toBe(true);
    const sql = read(path);
    expect(sql).toContain("licence_plan_name");
    expect(sql).toContain("practitioner_seats_purchased");
    expect(sql).toContain("licence_status");
    expect(sql).toContain("licence_starts_at");
    expect(sql).toContain("licence_ends_at");
    expect(sql.toLowerCase()).not.toMatch(/\bstripe\b/);
    expect(sql.toLowerCase()).not.toMatch(/\binvoice\b/);
    expect(sql).not.toMatch(/create table.*subscription/i);
  });
});
