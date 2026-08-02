import {
  EMPTY_SUMMARY_INSIGHTS_CONTENT,
  SUMMARY_INSIGHTS_LIMITS,
  type SummaryInsightItem,
  type SummaryInsightsContent,
} from "@/lib/summary-insights/types";

export type SummaryContentSource = {
  summary?: string | null;
  emergingThemes?: string | null;
  strengthsObserved?: string | null;
  valuesBecomingVisible?: string | null;
  professionalIdentityDevelopment?: string | null;
  agreedActions?: string | null;
  commitments?: string | null;
  suggestedFocus?: string | null;
  outcomes?: string | null;
  coachReflection?: string | null;
};

type SectionId =
  | "sessionSummary"
  | "keyInsights"
  | "strengths"
  | "developmentEvidence"
  | "coachingContext"
  | "commitments"
  | "possibleNextFocus"
  | "coachReflection"
  | "evidenceQualification";

const SECTION_ALIASES: Array<{ id: SectionId; patterns: RegExp[] }> = [
  {
    id: "sessionSummary",
    patterns: [/^session\s+summary\b/i],
  },
  {
    id: "keyInsights",
    patterns: [/^key\s+insights?\b/i, /^emerging\s+themes?\b/i],
  },
  {
    id: "strengths",
    patterns: [
      /^strengths?\s+observed\b/i,
      /^relevant\s+strengths?\s+and\s+capabilities\b/i,
    ],
  },
  {
    id: "developmentEvidence",
    patterns: [
      /^development\s+evidence\b/i,
      /^professional\s+identity\s+development\b/i,
    ],
  },
  {
    id: "coachingContext",
    patterns: [
      /^relevant\s+coaching\s+context\b/i,
      /^coaching\s+context\b/i,
      /^values\s+becoming\s+visible\b/i,
    ],
  },
  {
    id: "commitments",
    patterns: [
      /^agreed\s+commitments?\b/i,
      /^agreed\s+actions?\b/i,
      /^commitments?\b/i,
    ],
  },
  {
    id: "possibleNextFocus",
    patterns: [
      /^possible\s+next\s+focus\b/i,
      /^suggested\s+focus(?:\s+for\s+the\s+next\s+session)?\b/i,
      /^suggested\s+future\s+focus\b/i,
    ],
  },
  {
    id: "coachReflection",
    patterns: [/^coach\s+reflection\b/i],
  },
];

const EVIDENCE_NOTE_PATTERN =
  /^(?:the notes do not yet provide|no clearly evidenced|insufficient evidence|evidence remains|this remains|qualification)/i;

function stripLeadingNumbering(text: string): string {
  return text
    .replace(/^\s*\d+\s*[.)]\s*/, "")
    .replace(/^\s*\d+\s+/, "")
    .trim();
}

function stripMarkdownNoise(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .trim();
}

function cleanLine(text: string): string {
  return stripMarkdownNoise(stripLeadingNumbering(text)).trim();
}

function matchSectionId(line: string): SectionId | null {
  const cleaned = cleanLine(line);
  if (!cleaned) return null;

  for (const alias of SECTION_ALIASES) {
    if (alias.patterns.some(pattern => pattern.test(cleaned))) {
      return alias.id;
    }
  }

  return null;
}

function isSectionHeaderOnly(line: string): boolean {
  const cleaned = cleanLine(line);
  if (!cleaned) return false;
  const id = matchSectionId(cleaned);
  if (!id) return false;

  // Header-only when the line is essentially just the heading (optionally numbered).
  const withoutHeading = SECTION_ALIASES.find(entry => entry.id === id)!
    .patterns.reduce((value, pattern) => value.replace(pattern, ""), cleaned)
    .replace(/[:.\-–—]\s*$/, "")
    .trim();

  return withoutHeading.length === 0;
}

function looksLikeDashList(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  const dashLines = lines.filter(line => /^[-*•–—]\s+\S/.test(line));
  return dashLines.length >= 2 && dashLines.length >= Math.ceil(lines.length * 0.5);
}

function stripDashPrefix(line: string): string {
  return line.replace(/^[-*•–—]\s+/, "").trim();
}

function splitListItems(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (looksLikeDashList(trimmed) || /^[-*•–—]\s+\S/m.test(trimmed)) {
    return trimmed
      .split(/\r?\n/)
      .map(line => stripDashPrefix(line.trim()))
      .map(cleanLine)
      .filter(Boolean);
  }

  // Inline repeated dash entries after a section boundary: " - item - item"
  if (/\s[-–—]\s+\S/.test(trimmed) && (trimmed.match(/\s[-–—]\s+/g) ?? []).length >= 2) {
    return trimmed
      .split(/\s[-–—]\s+/)
      .map(part => cleanLine(part.replace(/^[-*•–—]\s+/, "")))
      .filter(Boolean);
  }

  return trimmed
    .split(/\r?\n+/)
    .map(line => cleanLine(stripDashPrefix(line)))
    .filter(Boolean)
    .flatMap(line => {
      // Numbered list items on separate conceptual entries
      if (/^\d+[.)]\s+/.test(line)) {
        return [cleanLine(line)];
      }
      return [line];
    });
}

function isSafeColonTitle(title: string, description: string): boolean {
  if (!title || !description) return false;
  if (title.length > 80) return false;
  if (/\d{1,2}:\d{2}/.test(`${title}:${description.slice(0, 12)}`)) return false;
  if (/^https?$/i.test(title)) return false;
  if (/^[A-Z]{2,}:/.test(`${title}:`)) return false; // URL-like schemes
  // Titles are short phrases, not full sentences.
  if (title.split(/\s+/).length > 10) return false;
  if (/[.!?]$/.test(title)) return false;
  return true;
}

function parseColonInsight(line: string): SummaryInsightItem | null {
  const cleaned = cleanLine(stripDashPrefix(line));
  const colonIndex = cleaned.indexOf(":");
  if (colonIndex <= 0) return null;

  const title = cleaned.slice(0, colonIndex).trim();
  const description = cleaned.slice(colonIndex + 1).trim();
  if (!isSafeColonTitle(title, description)) return null;

  return { title, description };
}

function parseInsightItems(text: string): SummaryInsightItem[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const items: SummaryInsightItem[] = [];
  let pendingTitle: string | null = null;
  let pendingDescription: string[] = [];

  const flush = () => {
    if (!pendingTitle) return;
    const description = pendingDescription.join(" ").trim();
    if (description) {
      items.push({ title: pendingTitle, description });
    } else {
      items.push({ title: pendingTitle, description: "" });
    }
    pendingTitle = null;
    pendingDescription = [];
  };

  for (const rawLine of lines) {
    if (isSectionHeaderOnly(rawLine)) continue;

    const colonItem = parseColonInsight(rawLine);
    if (colonItem) {
      flush();
      items.push(colonItem);
      continue;
    }

    const line = cleanLine(stripDashPrefix(rawLine));
    if (!line) continue;

    // Standalone short title line followed by description lines
    const wordCount = line.split(/\s+/).length;
    const looksLikeTitle =
      wordCount <= 8 &&
      !/[.!?]$/.test(line) &&
      line.length <= 80 &&
      !EVIDENCE_NOTE_PATTERN.test(line);

    if (looksLikeTitle && !pendingTitle) {
      pendingTitle = line;
      continue;
    }

    if (pendingTitle) {
      pendingDescription.push(line);
      continue;
    }

    // Fallback: untitled paragraph as a description-only item using first words
    const words = line.split(/\s+/);
    const title = words.slice(0, Math.min(4, words.length)).join(" ");
    items.push({
      title: title.replace(/[.,;:]+$/, ""),
      description: line,
    });
  }

  flush();
  return dedupeInsightItems(items.filter(item => item.description.trim() || item.title.trim()));
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalised = value.replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalised || seen.has(normalised)) continue;
    seen.add(normalised);
    result.push(value.replace(/\s+/g, " ").trim());
  }
  return result;
}

function dedupeInsightItems(items: SummaryInsightItem[]): SummaryInsightItem[] {
  const seen = new Set<string>();
  const result: SummaryInsightItem[] = [];
  for (const item of items) {
    const title = item.title.replace(/\s+/g, " ").trim();
    const description = item.description.replace(/\s+/g, " ").trim();
    if (!title && !description) continue;
    const key = `${title.toLowerCase()}::${description.toLowerCase()}`;
    if (seen.has(key)) continue;
    // Also drop duplicate descriptions under different titles
    const descriptionKey = `::${description.toLowerCase()}`;
    if (description && seen.has(descriptionKey)) continue;
    seen.add(key);
    if (description) seen.add(descriptionKey);
    result.push({ title: title || "Insight", description });
  }
  return result;
}

function extractEvidenceQualification(text: string): {
  body: string;
  qualification: string | null;
} {
  const lines = text.split(/\r?\n/);
  const bodyLines: string[] = [];
  const noteLines: string[] = [];

  for (const line of lines) {
    const cleaned = cleanLine(stripDashPrefix(line));
    if (!cleaned) continue;
    if (EVIDENCE_NOTE_PATTERN.test(cleaned) || /^evidence\s+note\b/i.test(cleaned)) {
      noteLines.push(cleaned.replace(/^evidence\s+note:\s*/i, ""));
    } else {
      bodyLines.push(line);
    }
  }

  return {
    body: bodyLines.join("\n").trim(),
    qualification: noteLines.length ? noteLines.join(" ").trim() : null,
  };
}

function splitRawDocument(text: string): Partial<Record<SectionId, string>> {
  const lines = text.split(/\r?\n/);
  const buckets: Partial<Record<SectionId, string[]>> = {};
  let current: SectionId | null = null;
  const preamble: string[] = [];

  for (const line of lines) {
    if (isSectionHeaderOnly(line) || matchSectionId(line)) {
      const header = matchSectionId(line);
      if (header && (isSectionHeaderOnly(line) || matchSectionId(cleanLine(line)))) {
        // If the line is a header with trailing content, keep trailing content.
        current = header;
        buckets[current] = buckets[current] ?? [];

        if (!isSectionHeaderOnly(line)) {
          const cleaned = cleanLine(line);
          const alias = SECTION_ALIASES.find(entry => entry.id === header);
          let remainder = cleaned;
          if (alias) {
            for (const pattern of alias.patterns) {
              remainder = remainder.replace(pattern, "");
            }
          }
          remainder = remainder.replace(/^[:.\-–—]\s*/, "").trim();
          if (remainder) buckets[current]!.push(remainder);
        }
        continue;
      }
    }

    if (current) {
      buckets[current] = buckets[current] ?? [];
      buckets[current]!.push(line);
    } else {
      preamble.push(line);
    }
  }

  const result: Partial<Record<SectionId, string>> = {};
  for (const [key, value] of Object.entries(buckets) as Array<[SectionId, string[]]>) {
    result[key] = value.join("\n").trim();
  }

  if (!result.sessionSummary && preamble.some(line => line.trim())) {
    result.sessionSummary = preamble.join("\n").trim();
  }

  return result;
}

function hasRecognisableSections(text: string): boolean {
  return text
    .split(/\r?\n/)
    .some(line => isSectionHeaderOnly(line) || Boolean(matchSectionId(line) && isSectionHeaderOnly(line)) || Boolean(matchSectionId(line)));
}

function paragraphFallback(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map(line => cleanLine(stripDashPrefix(line)))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampItems<T>(items: T[], limit: number): T[] {
  return items.slice(0, limit);
}

function fromSectionMap(
  sections: Partial<Record<SectionId, string>>
): SummaryInsightsContent {
  const developmentRaw = sections.developmentEvidence ?? "";
  const { body: developmentBody, qualification } =
    extractEvidenceQualification(developmentRaw);

  let evidenceQualification = qualification;
  if (
    !evidenceQualification &&
    sections.coachReflection &&
    EVIDENCE_NOTE_PATTERN.test(sections.coachReflection.trim())
  ) {
    evidenceQualification = sections.coachReflection.trim();
  }

  const coachingContextRaw = sections.coachingContext?.trim() || "";
  const sessionSummary = sections.sessionSummary
    ? paragraphFallback(sections.sessionSummary)
    : null;

  return {
    sessionSummary: sessionSummary || null,
    keyInsights: clampItems(
      parseInsightItems(sections.keyInsights ?? ""),
      SUMMARY_INSIGHTS_LIMITS.keyInsights
    ),
    strengths: clampItems(
      parseInsightItems(sections.strengths ?? ""),
      SUMMARY_INSIGHTS_LIMITS.strengths
    ),
    developmentEvidence: clampItems(
      parseInsightItems(developmentBody),
      SUMMARY_INSIGHTS_LIMITS.developmentEvidence
    ),
    coachingContext: coachingContextRaw
      ? paragraphFallback(coachingContextRaw) || null
      : null,
    commitments: clampItems(
      dedupeStrings(splitListItems(sections.commitments ?? "")),
      SUMMARY_INSIGHTS_LIMITS.commitments
    ),
    possibleNextFocus: clampItems(
      dedupeStrings(splitListItems(sections.possibleNextFocus ?? "")),
      SUMMARY_INSIGHTS_LIMITS.possibleNextFocus
    ),
    evidenceQualification: evidenceQualification,
  };
}

function mergeContent(
  base: SummaryInsightsContent,
  overlay: Partial<SummaryInsightsContent>
): SummaryInsightsContent {
  return {
    sessionSummary: overlay.sessionSummary ?? base.sessionSummary,
    keyInsights:
      overlay.keyInsights && overlay.keyInsights.length > 0
        ? overlay.keyInsights
        : base.keyInsights,
    strengths:
      overlay.strengths && overlay.strengths.length > 0
        ? overlay.strengths
        : base.strengths,
    developmentEvidence:
      overlay.developmentEvidence && overlay.developmentEvidence.length > 0
        ? overlay.developmentEvidence
        : base.developmentEvidence,
    coachingContext: overlay.coachingContext ?? base.coachingContext,
    commitments:
      overlay.commitments && overlay.commitments.length > 0
        ? overlay.commitments
        : base.commitments,
    possibleNextFocus:
      overlay.possibleNextFocus && overlay.possibleNextFocus.length > 0
        ? overlay.possibleNextFocus
        : base.possibleNextFocus,
    evidenceQualification:
      overlay.evidenceQualification ?? base.evidenceQualification,
  };
}

/**
 * Display-only transformation of stored summary fields / legacy raw text
 * into structured Summary & Insights content. Does not mutate stored values.
 */
export function normaliseSummaryContent(
  source: SummaryContentSource,
  structured?: SummaryInsightsContent | null
): SummaryInsightsContent {
  if (structured) {
    return {
      sessionSummary: structured.sessionSummary?.trim() || null,
      keyInsights: clampItems(
        dedupeInsightItems(structured.keyInsights),
        SUMMARY_INSIGHTS_LIMITS.keyInsights
      ),
      strengths: clampItems(
        dedupeInsightItems(structured.strengths),
        SUMMARY_INSIGHTS_LIMITS.strengths
      ),
      developmentEvidence: clampItems(
        dedupeInsightItems(structured.developmentEvidence),
        SUMMARY_INSIGHTS_LIMITS.developmentEvidence
      ),
      coachingContext: structured.coachingContext?.trim() || null,
      commitments: clampItems(
        dedupeStrings(structured.commitments),
        SUMMARY_INSIGHTS_LIMITS.commitments
      ),
      possibleNextFocus: clampItems(
        dedupeStrings(structured.possibleNextFocus),
        SUMMARY_INSIGHTS_LIMITS.possibleNextFocus
      ),
      evidenceQualification: structured.evidenceQualification?.trim() || null,
    };
  }

  const summaryText = (source.summary ?? "").trim();
  const fieldMap: Partial<Record<SectionId, string>> = {
    sessionSummary: summaryText,
    keyInsights: (source.emergingThemes ?? "").trim(),
    strengths: (source.strengthsObserved ?? "").trim(),
    developmentEvidence: (source.professionalIdentityDevelopment ?? "").trim(),
    coachingContext: (source.valuesBecomingVisible ?? "").trim(),
    commitments: (source.agreedActions || source.commitments || "").trim(),
    possibleNextFocus: (
      source.suggestedFocus ||
      source.outcomes ||
      ""
    ).trim(),
    coachReflection: (source.coachReflection ?? "").trim(),
  };

  // Historical records often store the entire numbered document in `summary`.
  if (summaryText && hasRecognisableSections(summaryText)) {
    const fromDocument = fromSectionMap(splitRawDocument(summaryText));
    const fromFields = fromSectionMap(fieldMap);

    // Prefer dedicated field content when present; fill gaps from document parse.
    return mergeContent(fromDocument, {
      sessionSummary: fromFields.sessionSummary?.includes("1.")
        ? fromDocument.sessionSummary
        : fromFields.sessionSummary &&
            !hasRecognisableSections(fromFields.sessionSummary)
          ? fromFields.sessionSummary
          : fromDocument.sessionSummary,
      keyInsights:
        fromFields.keyInsights.length > 0
          ? fromFields.keyInsights
          : fromDocument.keyInsights,
      strengths:
        fromFields.strengths.length > 0
          ? fromFields.strengths
          : fromDocument.strengths,
      developmentEvidence:
        fromFields.developmentEvidence.length > 0
          ? fromFields.developmentEvidence
          : fromDocument.developmentEvidence,
      coachingContext:
        fromFields.coachingContext || fromDocument.coachingContext,
      commitments:
        fromFields.commitments.length > 0
          ? fromFields.commitments
          : fromDocument.commitments,
      possibleNextFocus:
        fromFields.possibleNextFocus.length > 0
          ? fromFields.possibleNextFocus
          : fromDocument.possibleNextFocus,
      evidenceQualification:
        fromFields.evidenceQualification || fromDocument.evidenceQualification,
    });
  }

  const fromFields = fromSectionMap(fieldMap);

  // If summary is a wall of text without headings, keep it as the session summary.
  if (
    summaryText &&
    !fromFields.keyInsights.length &&
    !fromFields.strengths.length &&
    !hasRecognisableSections(summaryText)
  ) {
    return {
      ...fromFields,
      sessionSummary: paragraphFallback(summaryText) || null,
    };
  }

  if (
    !fromFields.sessionSummary &&
    !fromFields.keyInsights.length &&
    !fromFields.strengths.length &&
    !fromFields.developmentEvidence.length &&
    !fromFields.coachingContext &&
    !fromFields.commitments.length &&
    !fromFields.possibleNextFocus.length
  ) {
    if (summaryText) {
      return {
        ...EMPTY_SUMMARY_INSIGHTS_CONTENT,
        sessionSummary: paragraphFallback(summaryText) || null,
      };
    }
    return { ...EMPTY_SUMMARY_INSIGHTS_CONTENT };
  }

  return fromFields;
}

export function hasSummaryInsightsContent(
  content: SummaryInsightsContent
): boolean {
  return Boolean(
    content.sessionSummary?.trim() ||
      content.keyInsights.length ||
      content.strengths.length ||
      content.developmentEvidence.length ||
      content.coachingContext?.trim() ||
      content.commitments.length ||
      content.possibleNextFocus.length
  );
}

/** Test helpers exported for unit coverage of parsing rules. */
export const __summaryNormaliserTestUtils = {
  stripLeadingNumbering,
  parseColonInsight,
  parseInsightItems,
  splitListItems,
  splitRawDocument,
  matchSectionId,
  paragraphFallback,
};
