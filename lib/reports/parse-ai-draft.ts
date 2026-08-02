import type { ReportTheme } from "@/lib/reports/types";

export type DevelopmentReportAiDraft = {
  executiveSummary: string;
  progressSummary: string;
  developmentThemes: Array<Omit<ReportTheme, "id">>;
  futurePriorities: string[];
};

export function parseDevelopmentReportAiDraft(
  raw: string
): DevelopmentReportAiDraft {
  const text = raw.trim();
  if (!text) {
    return {
      executiveSummary: "",
      progressSummary: "",
      developmentThemes: [],
      futurePriorities: [],
    };
  }

  const section = (label: string, nextLabels: string[]) => {
    const start = text.search(new RegExp(`^\\s*\\d*\\.?\\s*${label}\\s*$`, "im"));
    if (start < 0) {
      const inline = text.search(new RegExp(`${label}\\s*[:\\n]`, "i"));
      if (inline < 0) return "";
      const afterLabel = text.slice(inline).replace(new RegExp(`^.*?${label}\\s*[:\\n]\\s*`, "i"), "");
      let end = afterLabel.length;
      for (const next of nextLabels) {
        const idx = afterLabel.search(new RegExp(`^\\s*\\d*\\.?\\s*${next}\\s*$`, "im"));
        if (idx >= 0) end = Math.min(end, idx);
      }
      return afterLabel.slice(0, end).trim();
    }

    const afterHeading = text.slice(start).replace(new RegExp(`^\\s*\\d*\\.?\\s*${label}\\s*`, "i"), "");
    let end = afterHeading.length;
    for (const next of nextLabels) {
      const idx = afterHeading.search(new RegExp(`^\\s*\\d*\\.?\\s*${next}\\s*$`, "im"));
      if (idx >= 0) end = Math.min(end, idx);
    }
    return afterHeading.slice(0, end).trim();
  };

  const executiveSummary = section("Executive Summary", [
    "Progress Summary",
    "Development Themes",
    "Future Priorities",
  ]);
  const progressSummary = section("Progress Summary", [
    "Development Themes",
    "Future Priorities",
  ]);
  const themesRaw = section("Development Themes", ["Future Priorities"]);
  const prioritiesRaw = section("Future Priorities", []);

  const developmentThemes: Array<Omit<ReportTheme, "id">> = [];
  const themeBlocks = themesRaw.split(/(?=Theme:\s*)/i);
  for (const block of themeBlocks) {
    const titleMatch = block.match(/Theme:\s*(.+)/i);
    const summaryMatch = block.match(/Summary:\s*([\s\S]+)/i);
    if (!titleMatch) continue;
    const title = titleMatch[1].split("\n")[0]?.trim() ?? "";
    const summary = (summaryMatch?.[1] ?? "")
      .replace(/Theme:\s*[\s\S]*/i, "")
      .trim();
    if (!title) continue;
    developmentThemes.push({ title, summary });
    if (developmentThemes.length >= 4) break;
  }

  const futurePriorities: string[] = [];
  const priorityBlocks = prioritiesRaw.split(/(?=Priority:\s*)/i);
  for (const block of priorityBlocks) {
    if (!/^Priority:/i.test(block.trim())) continue;
    const body = block.replace(/^Priority:\s*/i, "").trim();
    const firstLine = body.split(/\n/)[0]?.trim() || body;
    if (!firstLine) continue;
    futurePriorities.push(firstLine);
    if (futurePriorities.length >= 3) break;
  }

  return {
    executiveSummary,
    progressSummary,
    developmentThemes,
    futurePriorities,
  };
}
