import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganisationGuidanceType } from "@/lib/organisation-guidance/types";

export type OrganisationGuidanceMatch = {
  guidanceId: string;
  title: string;
  guidanceType: OrganisationGuidanceType;
  versionLabel: string | null;
  excerpt: string;
  score: number;
};

type ApprovedGuidanceRow = {
  id: string;
  guidance_type: string;
  title: string;
  version_label: string | null;
  effective_from: string | null;
  extracted_text: string | null;
};

const MAX_EXCERPT_CHARS = 1400;
const MAX_MATCHES = 3;

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "being",
  "could",
  "does",
  "from",
  "have",
  "into",
  "just",
  "more",
  "manager",
  "managers",
  "people",
  "team",
  "that",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

function normaliseWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map(word => word.replace(/^['-]+|['-]+$/g, ""))
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word));
}

function splitIntoPassages(text: string): string[] {
  const normalised = text.replace(/\r\n?/g, "\n").trim();
  if (!normalised) return [];

  const paragraphs = normalised
    .split(/\n{2,}/)
    .map(part => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const passages: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_EXCERPT_CHARS) {
      if (current) {
        passages.push(current);
        current = "";
      }

      for (let start = 0; start < paragraph.length; start += MAX_EXCERPT_CHARS) {
        passages.push(
          paragraph.slice(start, start + MAX_EXCERPT_CHARS).trim()
        );
      }
      continue;
    }

    const combined = current ? `${current}\n\n${paragraph}` : paragraph;

    if (combined.length <= MAX_EXCERPT_CHARS) {
      current = combined;
    } else {
      if (current) passages.push(current);
      current = paragraph;
    }
  }

  if (current) passages.push(current);

  return passages;
}

export function scoreOrganisationGuidancePassage(
  queryWords: Set<string>,
  passage: string
): number {
  if (queryWords.size === 0) return 0;

  const passageWords = new Set(normaliseWords(passage));
  let overlap = 0;

  for (const word of queryWords) {
    if (passageWords.has(word)) overlap += 1;
  }

  return overlap;
}

export function rankOrganisationGuidancePassages(input: {
  query: string;
  passages: Array<{
    guidanceId: string;
    title: string;
    guidanceType: OrganisationGuidanceType;
    versionLabel: string | null;
    excerpt: string;
  }>;
  limit?: number;
}): OrganisationGuidanceMatch[] {
  const queryWords = new Set(normaliseWords(input.query));
  if (queryWords.size === 0) return [];

  return input.passages
    .map(passage => ({
      ...passage,
      score: scoreOrganisationGuidancePassage(
        queryWords,
        passage.excerpt
      ),
    }))
    .filter(match => match.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(input.limit ?? MAX_MATCHES, MAX_MATCHES));
}

export async function retrieveOrganisationGuidance(input: {
  supabase: SupabaseClient;
  organisationId: string;
  query: string;
  limit?: number;
  asOfDate?: string;
}): Promise<OrganisationGuidanceMatch[]> {
  const queryWords = new Set(normaliseWords(input.query));
  if (queryWords.size === 0) return [];

  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);

  // Lifecycle metadata is queried separately from content retrieval so that
  // withdrawn successors can continue to suppress obsolete predecessors
  // without making withdrawn content eligible for Aurelia.
  const { data: lifecycleData, error: lifecycleError } = await input.supabase
    .from("organisation_guidance")
    .select("id, approved_at, withdrawn_at, effective_from, replaces_guidance_id")
    .eq("organisation_id", input.organisationId)
    .not("replaces_guidance_id", "is", null);

  if (lifecycleError) throw new Error(lifecycleError.message);

  const supersededGuidanceIds = new Set(
    ((lifecycleData ?? []) as Array<{
      id: string;
      approved_at: string | null;
      withdrawn_at: string | null;
      effective_from: string | null;
      replaces_guidance_id: string | null;
    }>)
      .filter(row => {
        if (!row.replaces_guidance_id || !row.approved_at) return false;

        const approvedDate = row.approved_at.slice(0, 10);
        const activationDate =
          row.effective_from && row.effective_from > approvedDate
            ? row.effective_from
            : approvedDate;

        if (activationDate > asOfDate) return false;

        if (row.withdrawn_at) {
          const withdrawnDate = row.withdrawn_at.slice(0, 10);
          if (withdrawnDate < activationDate) return false;
        }

        return true;
      })
      .map(row => row.replaces_guidance_id as string)
  );

  // Content retrieval remains deliberately approved-only. Lifecycle history
  // above may suppress content, but can never make withdrawn content eligible.
  const { data, error } = await input.supabase
    .from("organisation_guidance")
    .select(
      "id, guidance_type, title, version_label, effective_from, extracted_text"
    )
    .eq("organisation_id", input.organisationId)
    .eq("status", "approved")
    .not("extracted_text", "is", null);

  if (error) throw new Error(error.message);

  const matches: OrganisationGuidanceMatch[] = [];

  for (const row of (data ?? []) as ApprovedGuidanceRow[]) {
    // Approval and operational applicability are deliberately separate.
    // Future-effective guidance remains approved but must not influence Aurelia
    // until its effective date is reached.
    if (row.effective_from && row.effective_from > asOfDate) continue;
    if (supersededGuidanceIds.has(row.id)) continue;
    if (!row.extracted_text) continue;

    for (const excerpt of splitIntoPassages(row.extracted_text)) {
      const score = scoreOrganisationGuidancePassage(
        queryWords,
        excerpt
      );

      // Organisation-specific guidance should be conservative. A single
      // coincidental word is not enough to treat a passage as relevant.
      if (score < 2) continue;

      matches.push({
        guidanceId: row.id,
        title: row.title,
        guidanceType: row.guidance_type as OrganisationGuidanceType,
        versionLabel: row.version_label,
        excerpt,
        score,
      });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(input.limit ?? MAX_MATCHES, MAX_MATCHES));
}
