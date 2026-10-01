import { describe, expect, it, vi } from "vitest";
import {
  rankOrganisationGuidancePassages,
  retrieveOrganisationGuidance,
} from "@/lib/organisation-guidance";


function createLifecycleSupabase(rows: Array<Record<string, unknown>>) {
  return {
    from() {
      const filters: Array<
        | { kind: "eq"; column: string; value: unknown }
        | { kind: "not-null"; column: string }
      > = [];

      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ kind: "eq", column, value });
          return query;
        },
        not(column: string, operator: string, value: unknown) {
          if (operator === "is" && value === null) {
            filters.push({ kind: "not-null", column });
          }

          const data = rows.filter(row =>
            filters.every(filter => {
              if (filter.kind === "eq") {
                return row[filter.column] === filter.value;
              }

              return row[filter.column] !== null &&
                row[filter.column] !== undefined;
            })
          );

          return Promise.resolve({ data, error: null });
        },
      };

      return query;
    },
  };
}

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

  it("prefers relevant values guidance over an unrelated policy with incidental overlap", () => {
    const matches = rankOrganisationGuidancePassages({
      query:
        "Daniel has made a mistake on a piece of work and seems worried about telling me. How should I handle the conversation in a way that is supportive but still holds him accountable?",
      passages: [
        {
          guidanceId: "attendance",
          title: "Attendance Management Policy",
          guidanceType: "policy",
          versionLabel: "2.0",
          excerpt:
            "Managers should approach the conversation fairly, understand individual circumstances and be clear about attendance expectations.",
        },
        {
          guidanceId: "values",
          title: "Our Leadership Values",
          guidanceType: "values",
          versionLabel: "1.0",
          excerpt:
            "Compassion means supporting people with dignity and respect. Accountability means taking responsibility for actions and following through on commitments.",
        },
      ],
    });

    expect(matches.some(match => match.guidanceId === "values")).toBe(true);
    expect(matches.some(match => match.guidanceId === "attendance")).toBe(false);
  });

  it("does not force organisational guidance into an unrelated development question", () => {
    const matches = rankOrganisationGuidancePassages({
      query:
        "Daniel wants to become more confident presenting his ideas in team meetings. How can I help him develop this?",
      passages: [
        {
          guidanceId: "attendance",
          title: "Attendance Management Policy",
          guidanceType: "policy",
          versionLabel: "2.0",
          excerpt:
            "Repeated lateness should be discussed fairly. Managers should understand individual circumstances and clarify attendance expectations.",
        },
        {
          guidanceId: "values",
          title: "Our Leadership Values",
          guidanceType: "values",
          versionLabel: "1.0",
          excerpt:
            "Compassion means supporting people with dignity and respect. Accountability means taking responsibility for actions and following through on commitments.",
        },
      ],
    });

    expect(matches).toEqual([]);
  });

  it("does not combine distant concepts from a long no-line-break document into a false relevant passage", async () => {
    const attendanceText = [
      "Managers may provide support where attendance concerns arise.",
      "Attendance processes and procedural expectations apply consistently. ".repeat(12),
      "Managers follow the documented attendance process and record relevant facts. ".repeat(20),
      "Formal attendance processes require accountability for agreed attendance expectations.",
    ].join(" ");

    const rows = [
      {
        id: "attendance",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Management Policy",
        version_label: "2.0",
        effective_from: "2026-09-01",
        extracted_text: attendanceText,
        status: "approved",
        approved_at: "2026-09-01T09:00:00Z",
        withdrawn_at: null,
        replaces_guidance_id: null,
      },
      {
        id: "values",
        organisation_id: "org-current",
        guidance_type: "values",
        title: "Our Leadership Values",
        version_label: "1.0",
        effective_from: "2026-09-01",
        extracted_text: [
          "Our Leadership Values Test organisational guidance for Pridmora Pilot Compassion We seek to understand individual circumstances and treat people with dignity and respect.",
          "Accountability We are clear about expectations, address concerns fairly and take responsibility for following through on agreed actions.",
          "Consistency We aim to apply organisational expectations consistently while recognising that individual circumstances may require appropriate consideration.",
          "These values support managerial judgement.",
          "They do not replace organisational policies, People/HR advice or legal guidance where these are required.",
        ].join(" "),
        status: "approved",
        approved_at: "2026-09-01T09:00:00Z",
        withdrawn_at: null,
        replaces_guidance_id: null,
      },
    ];

    const supabase = createLifecycleSupabase(rows);

    const matches = await retrieveOrganisationGuidance({
      supabase: supabase as never,
      organisationId: "org-current",
      query:
        "Daniel has made a mistake on a piece of work and seems worried about telling me. How should I handle the conversation in a way that is supportive but still holds him accountable?",
      asOfDate: "2026-09-30",
    });

    expect(matches.some(match => match.guidanceId === "values")).toBe(true);
    expect(matches.some(match => match.guidanceId === "attendance")).toBe(false);
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

  it("returns only the strongest passage from each guidance document", async () => {
    const rows = [
      {
        id: "attendance",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Management Policy",
        version_label: "2.0",
        effective_from: "2026-09-01",
        extracted_text:
          "Repeated lateness requires managers to clarify attendance expectations and understand individual circumstances. " +
          "Attendance expectations should be discussed fairly and consistently when lateness continues.",
        status: "approved",
        approved_at: "2026-09-01T09:00:00Z",
        withdrawn_at: null,
        replaces_guidance_id: null,
      },
    ];

    const supabase = createLifecycleSupabase(rows);

    const matches = await retrieveOrganisationGuidance({
      supabase: supabase as never,
      organisationId: "org-current",
      query: "repeated lateness attendance expectations individual circumstances fairly consistently",
      asOfDate: "2026-09-30",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.guidanceId).toBe("attendance");
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
      "id, guidance_type, title, version_label, effective_from, extracted_text",
    ]);
    expect(calls).toContainEqual(["eq:organisation_id", "org-secure"]);
    expect(calls).toContainEqual(["eq:status", "approved"]);
    expect(calls).toContainEqual(["not:extracted_text:is", null]);
  });

  it("excludes approved guidance until its effective date", async () => {
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
              id: "current",
              guidance_type: "policy",
              title: "Current Attendance Policy",
              version_label: "v2",
              effective_from: "2026-09-01",
              extracted_text:
                "Repeated lateness should be discussed and attendance expectations clarified.",
            },
            {
              id: "future",
              guidance_type: "policy",
              title: "Future Attendance Policy",
              version_label: "v3",
              effective_from: "2026-10-01",
              extracted_text:
                "Repeated lateness should be discussed and attendance expectations clarified.",
            },
            {
              id: "undated",
              guidance_type: "values",
              title: "Our Values",
              version_label: null,
              effective_from: null,
              extracted_text:
                "Attendance conversations should balance expectations and individual circumstances.",
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
      query: "attendance expectations repeated lateness circumstances",
      asOfDate: "2026-09-29",
    });

    expect(matches.some(match => match.guidanceId === "current")).toBe(true);
    expect(matches.some(match => match.guidanceId === "undated")).toBe(true);
    expect(matches.some(match => match.guidanceId === "future")).toBe(false);
  });

  it("makes approved guidance eligible on its effective date", async () => {
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
              id: "effective-today",
              guidance_type: "policy",
              title: "Attendance Policy",
              version_label: "v3",
              effective_from: "2026-10-01",
              extracted_text:
                "Repeated lateness should be discussed and attendance expectations clarified.",
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
      query: "attendance expectations repeated lateness",
      asOfDate: "2026-10-01",
    });

    expect(matches.some(match => match.guidanceId === "effective-today")).toBe(
      true
    );
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

  it("keeps the predecessor active when its successor is still a draft", async () => {
    const rows = [
      {
        id: "v2",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Policy",
        version_label: "v2",
        effective_from: "2026-09-01",
        extracted_text:
          "Repeated lateness should be discussed and attendance expectations clarified.",
        status: "approved",
        replaces_guidance_id: null,
      },
      {
        id: "v3",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Policy",
        version_label: "v3",
        effective_from: null,
        extracted_text:
          "Repeated lateness should be discussed and attendance expectations clarified.",
        status: "draft",
        replaces_guidance_id: "v2",
      },
    ];

    const supabase = createLifecycleSupabase(rows);

    const matches = await retrieveOrganisationGuidance({
      supabase: supabase as never,
      organisationId: "org-current",
      query: "attendance expectations repeated lateness",
      asOfDate: "2026-09-29",
    });

    expect(matches.some(match => match.guidanceId === "v2")).toBe(true);
    expect(matches.some(match => match.guidanceId === "v3")).toBe(false);
  });

  it("keeps the predecessor active before an approved successor becomes effective", async () => {
    const rows = [
      {
        id: "v2",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Policy",
        version_label: "v2",
        effective_from: "2026-09-01",
        extracted_text:
          "Repeated lateness should be discussed and attendance expectations clarified.",
        status: "approved",
        replaces_guidance_id: null,
      },
      {
        id: "v3",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Policy",
        version_label: "v3",
        effective_from: "2026-10-01",
        extracted_text:
          "Repeated lateness should be discussed and attendance expectations clarified.",
        status: "approved",
        approved_at: "2026-09-29T09:00:00Z",
        withdrawn_at: null,
        replaces_guidance_id: "v2",
      },
    ];

    const supabase = createLifecycleSupabase(rows);

    const matches = await retrieveOrganisationGuidance({
      supabase: supabase as never,
      organisationId: "org-current",
      query: "attendance expectations repeated lateness",
      asOfDate: "2026-09-29",
    });

    expect(matches.some(match => match.guidanceId === "v2")).toBe(true);
    expect(matches.some(match => match.guidanceId === "v3")).toBe(false);
  });

  it("suppresses the predecessor when its approved successor becomes effective", async () => {
    const rows = [
      {
        id: "v2",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Policy",
        version_label: "v2",
        effective_from: "2026-09-01",
        extracted_text:
          "Repeated lateness should be discussed and attendance expectations clarified.",
        status: "approved",
        replaces_guidance_id: null,
      },
      {
        id: "v3",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Policy",
        version_label: "v3",
        effective_from: "2026-10-01",
        extracted_text:
          "Repeated lateness should be discussed and attendance expectations clarified.",
        status: "approved",
        approved_at: "2026-09-29T09:00:00Z",
        withdrawn_at: null,
        replaces_guidance_id: "v2",
      },
    ];

    const supabase = createLifecycleSupabase(rows);

    const matches = await retrieveOrganisationGuidance({
      supabase: supabase as never,
      organisationId: "org-current",
      query: "attendance expectations repeated lateness",
      asOfDate: "2026-10-01",
    });

    expect(matches.some(match => match.guidanceId === "v2")).toBe(false);
    expect(matches.some(match => match.guidanceId === "v3")).toBe(true);
  });

  it("does not resurrect a predecessor after its effective successor is withdrawn", async () => {
    const rows = [
      {
        id: "v2",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Policy",
        version_label: "v2",
        effective_from: "2026-09-01",
        extracted_text:
          "Repeated lateness should be discussed and attendance expectations clarified.",
        status: "approved",
        replaces_guidance_id: null,
      },
      {
        id: "v3",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Policy",
        version_label: "v3",
        effective_from: "2026-10-01",
        extracted_text:
          "Repeated lateness should be discussed and attendance expectations clarified.",
        status: "withdrawn",
        approved_at: "2026-09-29T09:00:00Z",
        withdrawn_at: "2026-10-02T09:00:00Z",
        replaces_guidance_id: "v2",
      },
    ];

    const supabase = createLifecycleSupabase(rows);

    const matches = await retrieveOrganisationGuidance({
      supabase: supabase as never,
      organisationId: "org-current",
      query: "attendance expectations repeated lateness",
      asOfDate: "2026-10-02",
    });

    expect(matches.some(match => match.guidanceId === "v2")).toBe(false);
    expect(matches.some(match => match.guidanceId === "v3")).toBe(false);
  });

  it("keeps the predecessor active when a future successor is withdrawn before becoming effective", async () => {
    const rows = [
      {
        id: "v2",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Policy",
        version_label: "v2",
        effective_from: "2026-09-01",
        extracted_text:
          "Repeated lateness should be discussed and attendance expectations clarified.",
        status: "approved",
        replaces_guidance_id: null,
      },
      {
        id: "v3",
        organisation_id: "org-current",
        guidance_type: "policy",
        title: "Attendance Policy",
        version_label: "v3",
        effective_from: "2026-10-01",
        extracted_text:
          "Repeated lateness should be discussed and attendance expectations clarified.",
        status: "withdrawn",
        approved_at: "2026-09-29T09:00:00Z",
        withdrawn_at: "2026-09-30T09:00:00Z",
        replaces_guidance_id: "v2",
      },
    ];

    const supabase = createLifecycleSupabase(rows);

    const matches = await retrieveOrganisationGuidance({
      supabase: supabase as never,
      organisationId: "org-current",
      query: "attendance expectations repeated lateness",
      asOfDate: "2026-10-02",
    });

    expect(matches.some(match => match.guidanceId === "v2")).toBe(true);
    expect(matches.some(match => match.guidanceId === "v3")).toBe(false);
  });

});
