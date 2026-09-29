import { describe, expect, it } from "vitest";
import { validateOrganisationGuidanceReplacement } from "@/lib/organisation-guidance";

type Row = Record<string, unknown>;

function createSupabase(rows: Row[]) {
  return {
    from() {
      const filters: Array<[string, unknown]> = [];

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        async maybeSingle() {
          const data =
            rows.find(row =>
              filters.every(([column, value]) => row[column] === value)
            ) ?? null;

          return { data, error: null };
        },
      };

      return builder;
    },
  };
}

const approvedPolicy = {
  id: "policy-v2",
  organisation_id: "org-a",
  guidance_type: "policy",
  status: "approved",
};

describe("Organisation Guidance replacement validation", () => {
  it("accepts an approved predecessor of the same type and organisation", async () => {
    await expect(
      validateOrganisationGuidanceReplacement({
        supabase: createSupabase([approvedPolicy]) as never,
        organisationId: "org-a",
        replacesGuidanceId: "policy-v2",
        guidanceType: "policy",
      })
    ).resolves.toBeUndefined();
  });

  it("rejects a predecessor from another organisation", async () => {
    await expect(
      validateOrganisationGuidanceReplacement({
        supabase: createSupabase([approvedPolicy]) as never,
        organisationId: "org-b",
        replacesGuidanceId: "policy-v2",
        guidanceType: "policy",
      })
    ).rejects.toThrow("approved item of the same type in this organisation");
  });

  it("rejects a predecessor of another guidance type", async () => {
    await expect(
      validateOrganisationGuidanceReplacement({
        supabase: createSupabase([approvedPolicy]) as never,
        organisationId: "org-a",
        replacesGuidanceId: "policy-v2",
        guidanceType: "values",
      })
    ).rejects.toThrow("approved item of the same type in this organisation");
  });

  it("rejects a predecessor that is not approved", async () => {
    await expect(
      validateOrganisationGuidanceReplacement({
        supabase: createSupabase([
          { ...approvedPolicy, status: "draft" },
        ]) as never,
        organisationId: "org-a",
        replacesGuidanceId: "policy-v2",
        guidanceType: "policy",
      })
    ).rejects.toThrow("approved item of the same type in this organisation");
  });
});
