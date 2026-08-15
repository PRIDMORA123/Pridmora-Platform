/**
 * Display-only longitudinal sections for Preparation Stage 1.
 * Derives from existing prep_ai_brief / adapter / profile signals — no schema change.
 */

export type LongitudinalPreparationSections = {
  developmentSinceLast: string | null;
  whatToPayAttentionTo: string | null;
  /** Evidential boundary statements (supported vs uncertain / to explore). */
  evidenceWorthExploring: string[];
  whatProgressCouldLookLike: string | null;
  /** Investigative themes for the manager — not a restatement of known evidence. */
  investigativeAreas?: string[];
};

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstSentences(value: string, max = 2): string {
  const text = collapse(value);
  if (!text) return "";
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  return parts
    .slice(0, max)
    .map(part => collapse(part))
    .filter(Boolean)
    .join(" ");
}

function comparisonKey(value: string): string {
  return collapse(value)
    .toLocaleLowerCase("en-GB")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

function isNearDuplicate(a: string, b: string): boolean {
  const left = comparisonKey(a);
  const right = comparisonKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    return shorter / longer >= 0.75;
  }
  return false;
}

function trimWords(value: string, maxWords: number): string {
  const words = collapse(value).split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function toEvidenceClause(value: string): string {
  let text = collapse(value);
  text = text.replace(
    /^(Alex|They|He|She|[A-Z][\p{L}'-]+)\s+(is|are|has been|have been|needs? to|needed to)\s+/iu,
    ""
  );
  text = text.replace(/^(Alex|They|He|She)\s+/iu, "");
  text = text.replace(/^(needs? to|needed to)\s+/i, "");
  text = text.replace(/^(is|are|has been|have been)\s+/i, "");
  return text.replace(/[.!?]+$/, "").trim();
}

function asThatClause(value: string): string {
  const text = toEvidenceClause(value);
  if (!text) return "";
  if (/^(practise|practice)\s+/i.test(text)) {
    return `they are ${text.replace(/^(practise|practice)\s+/i, "")}`;
  }
  if (/^(beginning|becoming|moving|stating|speaking|raising|clarifying|offering)/i.test(text)) {
    return `they are ${text}`;
  }
  if (/^(consistent|consistently)/i.test(text)) {
    return text;
  }
  return text;
}

/** Soften absolute framing so progress language stays observational, not asserted fact. */
function softenClause(value: string): string {
  let text = collapse(value);
  text = text.replace(
    /^(Alex|They|He|She|[A-Z][\p{L}'-]+)\s+(needs? to|needed to)\s+/iu,
    ""
  );
  text = text.replace(/^(needs? to|needed to)\s+/i, "");
  text = text.replace(/^(Alex|They|He|She|[A-Z][\p{L}'-]+)\s+/u, "");
  text = text.replace(/\bmust\b/gi, "can");
  text = text.replace(/\balways\b/gi, "more consistently");
  return text.trim();
}

function looksLikeConversationCompletionOutcome(value: string): boolean {
  return (
    /\bby the end of the conversation\b/i.test(value) ||
    /\bleaves with\b/i.test(value) ||
    /\bhas reviewed\b/i.test(value) ||
    /\bconversation[, ].*identified\b/i.test(value) ||
    /\bend of (this|the) (session|conversation)\b/i.test(value)
  );
}

/**
 * Observable developmental behaviour in work — not coaching-session completion.
 * Returns a lower-case clause ready for sentence framing.
 */
function shortBehaviouralEdge(value: string): string {
  const softened = softenClause(value);
  if (!softened) return "";

  const practise = softened.match(/^(practise|practice)\s+(.+)$/i);
  if (practise?.[2]) {
    let rest = practise[2].replace(/[.!?]+$/, "").trim();
    rest = rest
      .replace(/^stating\s+/i, "states ")
      .replace(/^speaking\s+/i, "speaks ")
      .replace(/^raising\s+/i, "raises ")
      .replace(/^clarifying\s+/i, "clarifies ")
      .replace(/^offering\s+/i, "offers ")
      .replace(/^making\s+/i, "makes ");
    return trimWords(rest, 32);
  }

  const action = softened.match(
    /\b(stating|speaking|raising|clarifying|offering|making)\b[\s\S]{8,120}/i
  );
  if (action?.[0]) {
    return trimWords(
      softenClause(action[0])
        .replace(/^stating\s+/i, "states ")
        .replace(/^speaking\s+/i, "speaks ")
        .replace(/^raising\s+/i, "raises ")
        .replace(/^clarifying\s+/i, "clarifies ")
        .replace(/^offering\s+/i, "offers ")
        .replace(/^making\s+/i, "makes "),
      32
    );
  }

  return trimWords(firstSentences(softened, 1), 28);
}

/**
 * Build optional richer preparation sections when evidence supports them.
 * Returns null/empty when content would be fabricated or duplicate.
 */
export function deriveLongitudinalPreparationSections(input: {
  isFirstSession?: boolean;
  primaryFocus?: string | null;
  exploration?: string | null;
  reflectionPrompt?: string | null;
  movementSummary?: string | null;
  previousConversationSummary?: string | null;
  themes?: Array<{ title?: string | null; basis?: string | null }> | null;
  patterns?: Array<{
    title?: string | null;
    description?: string | null;
    basis?: string | null;
  }> | null;
  /** Living-profile style entries with optional evidence status. */
  supportedEvidence?: string[] | null;
  emergingEdges?: string[] | null;
  contextualTensions?: string[] | null;
}): LongitudinalPreparationSections {
  if (input.isFirstSession) {
    return {
      developmentSinceLast: null,
      whatToPayAttentionTo: null,
      evidenceWorthExploring: [],
      whatProgressCouldLookLike: null,
      investigativeAreas: [],
    };
  }

  const primary = collapse(input.primaryFocus ?? "");
  const rivals = [primary];

  const exploration = firstSentences(input.exploration ?? "", 2);
  const previous = firstSentences(input.previousConversationSummary ?? "", 2);
  const movement = firstSentences(input.movementSummary ?? "", 2);

  let developmentSinceLast: string | null = null;
  for (const candidate of [exploration, previous, movement]) {
    if (!candidate) continue;
    if (rivals.some(rival => isNearDuplicate(candidate, rival))) continue;
    developmentSinceLast = trimWords(candidate, 70);
    rivals.push(developmentSinceLast);
    break;
  }

  const patternText = (input.patterns ?? [])
    .map(pattern => {
      const title = collapse(pattern.title ?? "");
      const detail = collapse(pattern.description || pattern.basis || "");
      // Prefer evidence-bearing pattern descriptions over generic coaching tips.
      if (
        detail &&
        !/invite|structure preparation|keep interpretations|keep the discussion/i.test(
          detail
        )
      ) {
        return detail;
      }
      if (title && detail && !isNearDuplicate(title, detail)) {
        return `${title}. ${detail}`;
      }
      return detail || title;
    })
    .map(collapse)
    .find(Boolean);

  let whatToPayAttentionTo: string | null = null;
  const tension = (input.contextualTensions ?? [])
    .map(collapse)
    .find(Boolean);
  const attentionSource = tension || patternText || "";
  if (
    attentionSource &&
    !rivals.some(rival => isNearDuplicate(attentionSource, rival))
  ) {
    whatToPayAttentionTo = trimWords(attentionSource, 55);
    rivals.push(whatToPayAttentionTo);
  }

  // Evidential boundary: what is supported vs still uncertain / needs exploring.
  const supported = (input.supportedEvidence ?? [])
    .map(collapse)
    .filter(Boolean)
    .find(item => !rivals.some(rival => isNearDuplicate(item, rival)));
  const emerging = (input.emergingEdges ?? [])
    .map(collapse)
    .filter(Boolean)
    .find(item => !rivals.some(rival => isNearDuplicate(item, rival)));
  const context = (input.contextualTensions ?? [])
    .map(collapse)
    .filter(Boolean)
    .find(item => !rivals.some(rival => isNearDuplicate(item, rival)));

  const evidenceWorthExploring: string[] = [];
  if (supported || emerging) {
    const supportedClause = supported ? asThatClause(supported) : "";
    const emergingClause = emerging ? asThatClause(emerging) : "";
    const contextClause = context ? toEvidenceClause(context) : "";

    if (supportedClause && emergingClause) {
      let statement = `There is evidence that ${supportedClause}, but less evidence yet that ${emergingClause}`;
      if (
        contextClause &&
        !isNearDuplicate(contextClause, emergingClause) &&
        !isNearDuplicate(contextClause, supportedClause)
      ) {
        statement += ` — particularly when ${contextClause
          .replace(/^(when|where)\s+/i, "")
          .replace(/^(alex|they)\s+/i, "")}`;
      }
      statement += ".";
      evidenceWorthExploring.push(trimWords(statement, 60));
      rivals.push(statement);
    } else if (emergingClause) {
      evidenceWorthExploring.push(
        trimWords(
          `It remains uncertain whether ${emergingClause} is becoming consistent in practice.`,
          45
        )
      );
    } else if (supportedClause) {
      evidenceWorthExploring.push(
        trimWords(
          `Approved evidence supports that ${supportedClause}; what would strengthen or challenge that picture is still useful to explore.`,
          50
        )
      );
    }
  }

  // Fallback: explore-oriented themes that are not the primary objective.
  if (evidenceWorthExploring.length === 0) {
    for (const theme of input.themes ?? []) {
      const title = collapse(theme.title ?? "");
      const basis = collapse(theme.basis ?? "");
      if (!title) continue;
      if (rivals.some(rival => isNearDuplicate(title, rival))) continue;
      if (
        !/explor|uncertain|gap|need|confirm|challenge|deepen|less evidence|not yet/i.test(
          `${basis} ${title}`
        )
      ) {
        continue;
      }
      evidenceWorthExploring.push(
        trimWords(
          `Useful to explore: ${toEvidenceClause(title)} — without treating it as already established.`,
          40
        )
      );
      break;
    }
  }

  // Observable developmental behaviour — not conversation-completion outcomes.
  // Prefer emerging edges with concrete practice verbs; skip session-completion prompts.
  let whatProgressCouldLookLike: string | null = null;
  const progressCandidates = [
    ...(input.emergingEdges ?? []),
    emerging || "",
    primary,
  ]
    .map(collapse)
    .filter(Boolean);

  for (const candidate of progressCandidates) {
    if (looksLikeConversationCompletionOutcome(candidate)) continue;
    const edge = shortBehaviouralEdge(candidate);
    if (!edge) continue;
    if (rivals.some(rival => isNearDuplicate(edge, rival))) continue;
    // Require a behavioural verb — otherwise omit rather than invent conversation outcomes.
    if (
      !/\b(states?|speaks?|clarifies|offers?|raises?|practises?|practices?|makes?)\b/i.test(
        edge
      )
    ) {
      continue;
    }
    let statement = `${edge.charAt(0).toUpperCase()}${edge.slice(1)}`;
    if (
      context &&
      !isNearDuplicate(statement, context) &&
      !/senior|colleague|context|meeting|situation/i.test(statement)
    ) {
      const contextTail = toEvidenceClause(context)
        .replace(/^(when|where)\s+/i, "")
        .replace(/^(alex|they)\s+/i, "");
      if (contextTail && !isNearDuplicate(statement, contextTail)) {
        statement += ` — including when ${contextTail}`;
      }
    }
    whatProgressCouldLookLike = trimWords(`${statement}.`, 50);
    rivals.push(whatProgressCouldLookLike);
    break;
  }

  // Only use reflectionPrompt when it already describes observable behaviour
  // (never conversation-completion wording such as "by the end of the conversation").
  const reflection = collapse(input.reflectionPrompt ?? "");
  if (
    !whatProgressCouldLookLike &&
    reflection &&
    !looksLikeConversationCompletionOutcome(reflection) &&
    /\b(states?|speaks?|clarifies|offers?|raises?|practises?|practices?)\b/i.test(
      reflection
    ) &&
    !rivals.some(rival => isNearDuplicate(reflection, rival))
  ) {
    whatProgressCouldLookLike = trimWords(firstSentences(reflection, 1), 45);
  }

  // Investigative areas — directions to enquire into, not evidence summaries.
  // Omit when there is insufficient longitudinal signal (bare focus alone is not enough).
  const investigativeAreas: string[] = [];
  const hasLongitudinalSignal = Boolean(
    developmentSinceLast ||
      whatToPayAttentionTo ||
      supported ||
      emerging ||
      context
  );
  const investigativeSeeds = [
    developmentSinceLast
      ? "What enabled the progress visible since the last conversation"
      : "",
    whatToPayAttentionTo || context
      ? "What gets in the way in the contexts that still feel harder"
      : "",
    hasLongitudinalSignal && (emerging || primary)
      ? "What would enable the next developmental step in a live work situation"
      : "",
    supported && emerging
      ? "Where the newer behaviour is still inconsistent across situations"
      : "",
  ];
  for (const seed of investigativeSeeds) {
    if (!seed) continue;
    if (investigativeAreas.some(existing => isNearDuplicate(existing, seed))) {
      continue;
    }
    if (
      developmentSinceLast &&
      isNearDuplicate(seed, developmentSinceLast)
    ) {
      continue;
    }
    investigativeAreas.push(seed);
    if (investigativeAreas.length >= 3) break;
  }

  return {
    developmentSinceLast,
    whatToPayAttentionTo,
    evidenceWorthExploring,
    whatProgressCouldLookLike,
    investigativeAreas,
  };
}

export function looksLikeCommitmentRevisitTitle(
  value: string | null | undefined
): boolean {
  return /^revisit the open commitment\b/i.test(collapse(value ?? ""));
}

/**
 * Stable session identity label for numbered development conversations.
 * Display-only — does not use preparation focus or intelligence prose.
 */
export function getDevelopmentConversationIdentityTitle(): string {
  return "Development conversation";
}
