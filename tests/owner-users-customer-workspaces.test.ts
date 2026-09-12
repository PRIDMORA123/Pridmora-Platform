import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("Owner Users customer workspace scope", () => {
  it("excludes Personal workspace memberships from the operational Owner Users list", () => {
    const sql = readFileSync(
      join(
        root,
        "supabase/migrations/20260912134500_owner_users_exclude_personal_workspaces.sql"
      ),
      "utf8"
    );

    expect(sql).toContain("owner_list_platform_users");
    expect(sql).toMatch(/o\.organisation_type\s*<>\s*'personal'/i);
    expect(sql).toContain("join public.organisations o on o.id = m.organisation_id");
  });

  it("does not delete or mutate users or memberships", () => {
    const sql = readFileSync(
      join(
        root,
        "supabase/migrations/20260912134500_owner_users_exclude_personal_workspaces.sql"
      ),
      "utf8"
    );

    expect(sql).not.toMatch(/delete\s+from\s+auth\.users/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.organisation_memberships/i);
    expect(sql).not.toMatch(/update\s+public\.organisation_memberships/i);
  });
});
