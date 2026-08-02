import { describe, expect, it } from "vitest";
import {
  isMissingDevelopmentReportsTable,
  toSafeReportsUserMessage,
} from "@/lib/reports/availability";

describe("isMissingDevelopmentReportsTable", () => {
  it("detects Postgres undefined_table code", () => {
    expect(
      isMissingDevelopmentReportsTable({
        code: "42P01",
        message: "relation \"public.development_reports\" does not exist",
      })
    ).toBe(true);
  });

  it("detects PostgREST schema cache wording", () => {
    expect(
      isMissingDevelopmentReportsTable({
        message:
          "Could not find the table 'public.development_reports' in the schema cache",
      })
    ).toBe(true);
  });

  it("ignores unrelated failures", () => {
    expect(
      isMissingDevelopmentReportsTable({
        code: "42501",
        message: "permission denied for table clients",
      })
    ).toBe(false);
  });
});

describe("toSafeReportsUserMessage", () => {
  it("never returns migration or SQL diagnostics", () => {
    const message = toSafeReportsUserMessage(
      new Error(
        "Apply supabase/migrations/20260726100000_development_reports.sql — relation development_reports does not exist"
      )
    );
    expect(message.toLowerCase()).not.toContain("migration");
    expect(message.toLowerCase()).not.toContain("sql");
    expect(message.toLowerCase()).not.toContain("development_reports");
  });

  it("returns empty for missing-table errors (UI uses unavailable state)", () => {
    expect(
      toSafeReportsUserMessage({
        code: "42P01",
        message: 'relation "development_reports" does not exist',
      })
    ).toBe("");
  });
});
