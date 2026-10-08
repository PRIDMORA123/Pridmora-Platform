import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_REPORT_TASK_PROMPT,
  developmentReportTaskPrompt,
} from "@/lib/ai/development-report-prompt";
import { parseDevelopmentReportAiDraft } from "@/lib/reports/parse-ai-draft";

describe("development report prompt", () => {
  it("preserves the parser's required headings and labels", () => {
    const prompt = DEVELOPMENT_REPORT_TASK_PROMPT;

    for (const heading of [
      "Executive Summary",
      "Progress Summary",
      "Development Themes",
      "Future Priorities",
    ]) {
      expect(prompt).toContain(heading);
    }

    expect(prompt).toContain("Theme: <title>");
    expect(prompt).toContain("Summary: <one or two sentences>");
    expect(prompt).toContain("Priority:");
  });

  it("requires evidence-led development rather than activity-based claims", () => {
    const prompt = DEVELOPMENT_REPORT_TASK_PROMPT;

    expect(prompt).toContain("activity alone as evidence of improvement");
    expect(prompt).toContain("Describe behavioural development only");
    expect(prompt).toContain("Avoid generic praise, repeated conclusions");
  });

  it("retains the concise progress snapshot constraints", () => {
    const prompt = developmentReportTaskPrompt("progress_snapshot");

    expect(prompt).toContain("PROGRESS SNAPSHOT CONSTRAINT");
    expect(prompt).toContain("at most two development themes");
  });

  it("parses the required output format into editable report sections", () => {
    const draft = parseDevelopmentReportAiDraft(`
1. Executive Summary
The available evidence documents management activity.

2. Progress Summary
Two conversations were recorded. Behavioural improvement is not yet established.

3. Development Themes
Theme: Development conversations
Summary: The manager recorded two conversations.

4. Future Priorities
Priority:
Record evidence of how subsequent conversations are handled.
`);

    expect(draft.executiveSummary).toContain("management activity");
    expect(draft.progressSummary).toContain("not yet established");
    expect(draft.developmentThemes).toEqual([
      {
        title: "Development conversations",
        summary: "The manager recorded two conversations.",
      },
    ]);
    expect(draft.futurePriorities).toEqual([
      "Record evidence of how subsequent conversations are handled.",
    ]);
  });
});
