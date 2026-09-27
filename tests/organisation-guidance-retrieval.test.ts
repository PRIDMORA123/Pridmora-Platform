import { describe, expect, it, vi } from "vitest";
import {
  rankOrganisationGuidancePassages,
  retrieveOrganisationGuidance,
} from "@/lib/organisation-guidance";

describe("Organisation Guidance retrieval", () => {
  it("ranks the passage with the strongest meaningful overlap first", () => {
    const matches = rankOrganisationGuidancePassages({
      query:
        "A manager needs to discuss repeated lateness, childcare circumstances and expectations fairly.",
      passages: [
        {
          guidanceId: "attendance",
          title: "Attendance Management Policy",
          guidanceType: "policy",
          versionLabel: "4.2",
          excerpt:
            "Repeated lateness should be discussed with the employee. Managers should understand individual circumstances and clarify attendance expectations.",
        },
        {
          guidanceId: "values",
          title: "Our Values",
          guidanceType: "values",
          versionLabel: null,
          excerpt:
            "Managers should act fairly and respectfully when considering individual circumstances.",
        },
        {
          guidanceId: "expenses",
          title: "Expenses Policy",
          guidanceType: "policy",
          versionLabel: null,
          excerpt:
            "Managers approve travel expenses and mileage claims for business journeys.",
        },
      ],
    });

    expect(matches).toHaveLength(2);
    expect(matches[0]?.guidanceId).toBe("attendance");
    expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 0);
    expect(matches.some(match => match.guidanceId === "expenses")).toBe(false);
  });

  it("returns no guidance for a weak one-word coincidence", () => {
    const matches = rankOrganisationGuidancePassages({
      query: "The team is planning a new service improvement.",
      passages: [
        {
          guidanceId: "attendance",
          title: "Attendance Management Policy",
          guidanceType: "policy",
          versionLabel: null,
          excerpt:
            "The team manager should record repeated lateness and discuss attendance expectations.",
        },
      ],
    });

    expect(matches).toEqual([]);
  });

  it("caps returned guidance at three passages", () => {
    const passages = Array.from({ length: 6 }, (_, index) => ({
      guidanceId: `policy-${index}`,
      title: `Policy ${index}`,
      guidanceType: "policy" as const,
      versionLabel: null,
      excerpt:
        "Managers should discuss attendance expectations and individual circumstances fairly.",
    }));

    expect(
      rankOrganisationGuidancePassages({
        query: "Discuss attendance expectations and individual circumstances.",
        passages,
        limit: 10,
      })
    ).toHaveLength(3);
  });

  it("keeps retrieved excerpts bounded before they can reach Aurelia", async () => {
    const longText = `${"attendance expectations individual circumstances ".repeat(
      80
    )}end`;

    const query = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      not() {
        return Promise.resolve({
          data: [
            {
              id: "attendance",
              guidance_type: "policy",
              title: "Attendance Policy",
              version_label: "v2",
              extracted_text: longText,
            },
          ],
          error: null,
        });
      },
    };

    const supabase = {
      from() {
        return query;
      },
    };

    const matches = await retrieveOrganisationGuidance({
      supabase: supabase as never,
      organisationId: "org-current",
      query: "attendance expectations individual circumstances",
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThanOrEqual(3);
    expect(matches.every(match => match.excerpt.length <= 1400)).toBe(true);
  });

  it("requests only the minimum approved guidance fields needed for retrieval", async () => {
    const calls: Array<[string, unknown]> = [];

    const query = {
      select(value: string) {
        calls.push(["select", value]);
        return this;
      },
      eq(column: string, value: unknown) {
        calls.push([`eq:${column}`, value]);
        return this;
      },
      not(column: string, operator: string, value: unknown) {
        calls.push([`not:${column}:${operator}`, value]);
        return Promise.resolve({ data: [], error: null });
      },
    };

    const supabase = {
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    };

    await retrieveOrganisationGuidance({
      supabase: supabase as never,
      organisationId: "org-secure",
      query: "attendance expectations",
    });

    expect(calls).toContainEqual([
      "select",
      "id, guidance_type, title, version_label, extracted_text",
    ]);
    expect(calls).toContainEqual(["eq:organisation_id", "org-secure"]);
    expect(calls).toContainEqual(["eq:status", "approved"]);
    expect(calls).toContainEqual(["not:extracted_text:is", null]);
  });

  it("does not query the guidance table when the manager message has no meaningful retrieval words", async () => {
    const from = vi.fn();

    const matches = await retrieveOrganisationGuidance({
      supabase: { from } as never,
      organisationId: "org-current",
      query: "What about this?",
    });

    expect(matches).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("queries only approved guidance for the current organisation", async () => {
    const calls: Array<[string, unknown]> = [];

    const query = {
      select(value: string) {
        calls.push(["select", value]);
        return this;
      },
      eq(column: string, value: unknown) {
        calls.push([`eq:${column}`, value]);
        return this;
      },
      not(column: string, operator: string, value: unknown) {
        calls.push([`not:${column}:${operator}`, value]);
        return Promise.resolve({ data: [], error: null });
      },
    };

    const supabase = {
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    };

    await retrieveOrganisationGuidance({
      supabase: supabase as never,
      organisationId: "org-current",
      query: "attendance expectations",
    });

    expect(calls).toContainEqual(["from", "organisation_guidance"]);
    expect(calls).toContainEqual(["eq:organisation_id", "org-current"]);
    expect(calls).toContainEqual(["eq:status", "approved"]);
  });
});
