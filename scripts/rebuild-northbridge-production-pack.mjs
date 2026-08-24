#!/usr/bin/env node
/**
 * Rebuild Northbridge demonstration pack using the live production AI workflow.
 *
 * Generate once → coach-review (quality gate) → freeze into pack JSON.
 * Installation never regenerates intelligence.
 *
 * Usage:
 *   node --import ./scripts/ts-alias-loader.mjs --experimental-strip-types \
 *     scripts/rebuild-northbridge-production-pack.mjs
 *
 * Options:
 *   --relationship=<key>   Rebuild a single relationship (resume-friendly)
 *   --force                Ignore checkpoint cache
 *   --concurrency=<n>      Parallel relationships (default 2)
 *   --compose              Author remaining relationships through production
 *                          serialisers when live API access is unavailable
 */
import OpenAI from "openai";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./load-env-local.mjs";
import {
  composeDevelopmentUpdate,
  composeSummaryContent,
} from "./northbridge-compose-intelligence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "sample-data", "northbridge-healthcare");
const cacheDir = join(root, "tmp", "northbridge-rebuild");
const cachePath = join(cacheDir, "checkpoint.json");

loadEnvLocal(root);

const {
  DRAFT_SUMMARY_INSTRUCTIONS,
  buildDraftSummaryInput,
} = await import("../lib/ai/draft-summary-prompt.ts");
const {
  DEVELOPMENT_UPDATE_SYSTEM_PROMPT,
  buildDevelopmentUpdateInput,
  formatProfileForPrompt,
} = await import("../lib/ai/development-update-prompt.ts");
const { parseSummaryInsightsFromModel } = await import(
  "../lib/summary-insights/parse-summary-json.ts"
);
const { serialiseSummaryContent } = await import(
  "../lib/summary-insights/serialise-summary-content.ts"
);
const { parseDevelopmentUpdateGeneration } = await import(
  "../lib/development-updates/schema.ts"
);
const { hasAnyProposedChanges } = await import(
  "../lib/development-updates/types.ts"
);
const { createPersonLevelResponse } = await import(
  "../lib/ai/person-level-openai.ts"
);
const { knownIdentitiesFromPublicClient } = await import(
  "../lib/ai/minimise-for-external.ts"
);

const ORGANISATION_LABEL = "Northbridge Healthcare Trust";
const PACK_VERSION = "2.0.0";
const MODEL = "gpt-5.5";
const ANCHOR = new Date("2026-08-04T12:00:00.000Z");

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const composeMode = args.has("--compose");
const onlyRel =
  [...args].find(a => a.startsWith("--relationship="))?.split("=")[1] ?? null;
const concurrency = Math.max(
  1,
  Number(
    [...args].find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? 2
  ) || 2
);

const DEMO_SUMMARY_ADDENDUM = `
DEMONSTRATION QUALITY REQUIREMENTS FOR THIS PACK (take precedence over length caps above):
- sessionSummary: write a professional coaching narrative of approximately 180–250 words.
  Explain what happened, what changed, which behavioural patterns emerged, why they matter,
  and what should influence the next conversation.
- keyInsights: maximum 3. Each must be a coaching observation supported by evidence — not a topic tag.
- strengths: observed behaviour only, with why the strength has been recognised. Maximum 3.
- developmentEvidence: specific behavioural examples, not conclusions. Maximum 3.
- coachingContext: a concise briefing for the next coaching session.
- Use UK English. Be specific, evidence-based, behavioural and commercially impressive.
- An experienced executive coach should be comfortable approving this record.
`;

const DEMO_DEVELOPMENT_ADDENDUM = `
DEMONSTRATION QUALITY REQUIREMENTS:
- Propose meaningful, coach-approvable changes that build a rich living development profile.
- Include emergingThemes, strengths and growthAreas with clear evidence when supported.
- Prefer supported / well_established statuses when the conversation history justifies them.
- Avoid generic filler. Keep language specific and behavioural.
- Use UK English.
`;

const RELATIONSHIPS = [
  {
    key: "sarah-mitchell",
    identityMode: "standard",
    name: "Sarah Mitchell",
    displayLabel: "Sarah Mitchell",
    role: "Ward Manager",
    organisationLabel: ORGANISATION_LABEL,
    email: "sarah.mitchell.sample@northbridge.example",
    currentFocus: "Confidence, delegation and communication",
    aiNameAllowed: true,
    themes: ["confidence", "delegation", "communication"],
  },
  {
    key: "james-carter",
    identityMode: "standard",
    name: "James Carter",
    displayLabel: "James Carter",
    role: "Call Centre Manager (Acting)",
    organisationLabel: ORGANISATION_LABEL,
    email: "james.carter.sample@northbridge.example",
    currentFocus: "Confidence and difficult conversations",
    aiNameAllowed: true,
    themes: ["confidence", "difficult_conversations", "communication"],
  },
  {
    key: "emma-hughes",
    identityMode: "standard",
    name: "Emma Hughes",
    displayLabel: "Emma Hughes",
    role: "Finance Manager",
    organisationLabel: ORGANISATION_LABEL,
    email: "emma.hughes.sample@northbridge.example",
    currentFocus: "Delegation and strategic leadership",
    aiNameAllowed: true,
    themes: ["delegation", "strategic_leadership", "stakeholder_influence"],
  },
  {
    key: "daniel-roberts",
    identityMode: "standard",
    name: "Daniel Roberts",
    displayLabel: "Daniel Roberts",
    role: "Estates Manager",
    organisationLabel: ORGANISATION_LABEL,
    email: "daniel.roberts.sample@northbridge.example",
    currentFocus: "Feedback conversations",
    aiNameAllowed: true,
    themes: ["difficult_conversations", "communication", "confidence"],
  },
  {
    key: "priya-shah",
    identityMode: "standard",
    name: "Priya Shah",
    displayLabel: "Priya Shah",
    role: "Procurement Manager",
    organisationLabel: ORGANISATION_LABEL,
    email: "priya.shah.sample@northbridge.example",
    currentFocus: "Stakeholder influence",
    aiNameAllowed: true,
    themes: ["stakeholder_influence", "strategic_leadership", "communication"],
  },
  {
    key: "michael-green",
    identityMode: "standard",
    name: "Michael Green",
    displayLabel: "Michael Green",
    role: "Outpatient Services Manager",
    organisationLabel: ORGANISATION_LABEL,
    email: "michael.green.sample@northbridge.example",
    currentFocus: "Accountability and delegation",
    aiNameAllowed: true,
    themes: ["delegation", "confidence", "difficult_conversations"],
  },
  {
    key: "helen-brooks",
    identityMode: "standard",
    name: "Helen Brooks",
    displayLabel: "Helen Brooks",
    role: "HR Business Partner",
    organisationLabel: ORGANISATION_LABEL,
    email: "helen.brooks.sample@northbridge.example",
    currentFocus: "Executive presence and strategic influence",
    aiNameAllowed: true,
    themes: ["strategic_leadership", "stakeholder_influence", "communication"],
  },
  {
    key: "clinical-lead-a",
    identityMode: "confidential",
    name: "",
    displayLabel: "Clinical Lead programme",
    role: "Clinical Lead",
    organisationLabel: ORGANISATION_LABEL,
    email: "",
    currentFocus: "Psychological safety",
    aiNameAllowed: false,
    themes: ["confidence", "communication", "difficult_conversations"],
  },
  {
    key: "rachel-morgan",
    identityMode: "standard",
    name: "Rachel Morgan",
    displayLabel: "Rachel Morgan",
    role: "Head of Administration",
    organisationLabel: ORGANISATION_LABEL,
    email: "rachel.morgan.sample@northbridge.example",
    currentFocus: "Coaching culture",
    aiNameAllowed: true,
    themes: ["delegation", "communication", "stakeholder_influence"],
  },
  {
    key: "owen-lewis",
    identityMode: "standard",
    name: "Owen Lewis",
    displayLabel: "Owen Lewis",
    role: "IT Service Manager",
    organisationLabel: ORGANISATION_LABEL,
    email: "owen.lewis.sample@northbridge.example",
    currentFocus: "Collaboration and communication",
    aiNameAllowed: true,
    themes: ["communication", "stakeholder_influence", "difficult_conversations"],
  },
  {
    key: "operations-director-b",
    identityMode: "confidential",
    name: "",
    displayLabel: "Operations leadership programme",
    role: "Operations Director",
    organisationLabel: ORGANISATION_LABEL,
    email: "",
    currentFocus: "Leading change",
    aiNameAllowed: false,
    themes: ["strategic_leadership", "difficult_conversations", "delegation"],
  },
  {
    key: "aisha-khan",
    identityMode: "standard",
    name: "Aisha Khan",
    displayLabel: "Aisha Khan",
    role: "Service Improvement Lead",
    organisationLabel: ORGANISATION_LABEL,
    email: "aisha.khan.sample@northbridge.example",
    currentFocus: "Strategic leadership and visibility",
    aiNameAllowed: true,
    themes: ["strategic_leadership", "confidence", "stakeholder_influence"],
  },
];

/** Progressive coaching arcs — rich notes input for the production summary pipeline. */
const ARC = {
  confidence: {
    foci: [
      "Finding a steadier voice in senior forums",
      "Speaking earlier without over-preparing",
      "Holding a clear position under challenge",
      "Recovering quickly after a shaky contribution",
      "Leading a short update with authority",
      "Sustaining confidence across uneven weeks",
    ],
    incidents: [
      "Paused too long before speaking in the directorate huddle; a peer filled the gap with a thinner recommendation.",
      "Prepared extensively for a quality board update, then compressed the ask so tightly that the decision request was unclear.",
      "Held a clearer position when challenged on staffing, then softened mid-sentence when a director frowned.",
      "Recovered well after a difficult exchange by naming the decision and rationale in one breath.",
      "Delivered a two-minute position statement that landed; one follow-up question still triggered over-explanation.",
      "Across two forums this month, contribution was earlier and cleaner, with one relapse when the room felt adversarial.",
    ],
  },
  delegation: {
    foci: [
      "Releasing work that still sits personally",
      "Briefing outcomes rather than methods",
      "Staying out of rework under pressure",
      "Trusting the check-in rather than reclaiming",
      "Making ownership visible to the team",
      "Protecting delegation when operational heat rises",
    ],
    incidents: [
      "Mapped three recurring tasks still held personally; one handoff failed because the outcome was vague.",
      "Briefed a colleague on a rota change with clearer outcomes; still intervened twice before the agreed check-in.",
      "A handoff slipped when pace rose; the brief was incomplete rather than the colleague incapable.",
      "Held back from reclaiming a delayed piece and asked for the owner's plan first — useful shift.",
      "Ownership language improved in the team huddle; one task still drifted back overnight under pressure.",
      "Delegation held through a busy week on two tasks; a third was pulled back when a complaint arrived.",
    ],
  },
  communication: {
    foci: [
      "Shorter messages under time pressure",
      "Listening before advising",
      "Matching tone to senior audiences",
      "Leading with the ask",
      "Tightening language without losing care",
      "Keeping clarity when the room speeds up",
    ],
    incidents: [
      "A difficult update email ran long; the ask was buried after operational detail.",
      "In a 1:1, advice arrived early and the other person closed down; listening shortened.",
      "Peer conversations improved with a three-part structure; senior forums still detail-first.",
      "Rewrote one update to context–ask–next step; response time improved the same day.",
      "Paused before advising in two conversations; one still slid into fixing too soon.",
      "Clarity held with peers and one senior update; under incident pressure, old length returned.",
    ],
  },
  difficult_conversations: {
    foci: [
      "Naming the issue earlier",
      "Opening feedback with purpose",
      "Staying present when challenged",
      "Balancing candour and care",
      "Closing a delayed conversation",
      "Making difficult talks more routine",
    ],
    incidents: [
      "An overdue feedback conversation was postponed again; anxiety dropped once purpose was written down.",
      "Rehearsed an opening line; the live conversation stayed polite and avoided impact.",
      "Named impact in one peer conversation; another was deferred when the other person became defensive.",
      "Held a clearer feedback exchange using behaviour–impact–ask; left feeling steadier.",
      "Scheduled and completed the delayed conversation within five working days — credible progress.",
      "Two conversations held well this month; one still softened when relationships felt fragile.",
    ],
  },
  strategic_leadership: {
    foci: [
      "Moving from operational depth to direction",
      "Framing recommendations with trade-offs",
      "Making the strategic ask visible",
      "Protecting time for horizon thinking",
      "Influencing without the formal mandate",
      "Holding direction when detail pulls back",
    ],
    incidents: [
      "Operational depth was praised, then crowded out the directional contribution in a leadership meeting.",
      "Practised framing options plus a preferred path; still defaulted to detail when unsure.",
      "Brought a clearer recommendation; one forum stayed strategic, another slipped into task listing.",
      "Protected thirty minutes for horizon thinking and used it before a programme decision.",
      "Influenced a cross-team choice without formal authority by naming shared outcomes first.",
      "Strategic framing held in one board update; under delivery pressure, detail-as-safety returned.",
    ],
  },
  stakeholder_influence: {
    foci: [
      "Mapping who shapes decisions",
      "Building alliances earlier",
      "Leading with shared interests",
      "Engaging informal influencers",
      "Influencing without overselling",
      "Keeping alliances warm between decisions",
    ],
    incidents: [
      "Stakeholder map missed two informal influencers who later shaped the decision.",
      "An influence attempt felt pushy; agreed to lead with shared interests next time.",
      "Held one useful informal conversation before a programme gate — changed the room.",
      "Alliance building improved; still underestimated a clinical lead outside the formal chain.",
      "Updated the map after a meeting and engaged earlier; pitch tone stayed measured.",
      "Influence was steadier this month; one late engagement repeated the old pattern.",
    ],
  },
};

function daysAgo(n) {
  const d = new Date(ANCHOR);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function isoDaysAgo(n, hour = 10) {
  const d = new Date(ANCHOR);
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function emptyProfile(currentFocus = "") {
  return {
    currentFocus,
    strengths: [],
    values: [],
    motivators: [],
    emergingThemes: [],
    growthAreas: [],
    coachingPreferences: [],
    beliefs: [],
    patterns: [],
    commitments: [],
  };
}

function normaliseValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function mergeEntries(existing, changes) {
  let result = [...(existing || [])];
  if (!changes) return result;

  for (const rem of changes.remove || []) {
    const id = typeof rem === "string" ? "" : rem.id || "";
    const value = typeof rem === "string" ? rem : rem.value || "";
    const norm = normaliseValue(value);
    result = result.filter(
      item =>
        !(id && item.id === id) &&
        !(norm && normaliseValue(item.value) === norm)
    );
  }

  for (const upd of changes.update || []) {
    const norm = normaliseValue(upd.value);
    const idx = result.findIndex(
      item =>
        (upd.id && item.id === upd.id) ||
        (norm && normaliseValue(item.value) === norm)
    );
    if (idx >= 0) {
      result[idx] = {
        ...result[idx],
        value: upd.value || result[idx].value,
        status: upd.status || result[idx].status,
        reason: upd.reason ?? result[idx].reason,
      };
    }
  }

  for (const add of changes.add || []) {
    const value = String(add.value || "").trim();
    if (!value) continue;
    const norm = normaliseValue(value);
    const idx = result.findIndex(item => normaliseValue(item.value) === norm);
    if (idx >= 0) {
      result[idx] = {
        ...result[idx],
        status: add.status || result[idx].status || "supported",
        reason: add.reason ?? result[idx].reason,
      };
    } else {
      result.push({
        id: add.id || crypto.randomUUID(),
        value,
        status: add.status || "emerging",
        reason: add.reason || "",
      });
    }
  }

  return result;
}

function applyProposedChanges(profile, changes) {
  const next = { ...profile, commitments: [...(profile.commitments || [])] };
  if (!changes) return next;

  if (changes.currentFocus?.value) {
    next.currentFocus = String(changes.currentFocus.value).trim();
  }

  for (const key of [
    "strengths",
    "values",
    "motivators",
    "emergingThemes",
    "growthAreas",
    "coachingPreferences",
    "beliefs",
    "patterns",
  ]) {
    if (changes[key]) next[key] = mergeEntries(next[key], changes[key]);
  }

  return next;
}

function personLabel(rel) {
  return rel.identityMode === "confidential" ? rel.displayLabel : rel.name;
}

function identitiesForRelationship(rel) {
  return knownIdentitiesFromPublicClient({
    name: rel.name || "",
    displayLabel: rel.displayLabel || null,
    organisation: rel.organisationLabel || null,
    role: rel.role || null,
    identityMode: rel.identityMode || "standard",
    aiNameAllowed: Boolean(rel.aiNameAllowed),
  });
}

function buildCoachNotes(rel, sessionIndex, themeKey, priorSummaries) {
  const arc = ARC[themeKey] || ARC.confidence;
  const focus = arc.foci[sessionIndex] || arc.foci[0];
  const incident = arc.incidents[sessionIndex] || arc.incidents[0];
  const name = personLabel(rel);
  const prior =
    priorSummaries.length === 0
      ? "No prior approved summaries in this programme yet."
      : priorSummaries
          .slice(-2)
          .map((s, i) => `Prior conversation ${priorSummaries.length - 1 + i}: ${s.slice(0, 220)}`)
          .join("\n");

  const shiftBySession = [
    "Awareness increased; behaviour change still emerging.",
    "One concrete experiment was attempted between sessions.",
    "Mixed week: clearer in familiar settings, cautious under scrutiny.",
    "A stronger behavioural attempt landed and was reviewed in detail.",
    "Progress is believable rather than linear; old habits still appear under heat.",
    "Across the arc, contribution and ownership are steadier, with unfinished edges.",
  ][sessionIndex];

  const agreed = [
    `Prepare a short position or handoff for the live situation discussed, and notice what happens.`,
    `Run one agreed experiment this week and bring a specific example back.`,
    `Protect one practice (pause, brief, or opening line) before the next high-stakes moment.`,
    `Complete the delayed conversation or handoff within five working days.`,
    `Repeat the successful behaviour once more in a harder setting and note the difference.`,
    `Choose one sustaining habit for the next fortnight and one risk situation to watch.`,
  ][sessionIndex];

  return [
    `Relationship: ${name} · ${rel.role} · ${rel.organisationLabel}`,
    `Programme focus: ${rel.currentFocus}`,
    `Conversation ${sessionIndex + 1} focus: ${focus}`,
    "",
    "What happened in the conversation:",
    incident,
    `${name} described the moment in concrete behavioural terms rather than general self-criticism.`,
    "",
    "What shifted:",
    shiftBySession,
    "We separated intention from enacted behaviour and identified where pressure changed the pattern.",
    "",
    "Patterns becoming visible:",
    `Theme in play: ${themeKey.replace(/_/g, " ")}.`,
    "The pattern matters because it affects credibility, team ownership or influence in the trust.",
    "",
    "Agreed commitments:",
    agreed,
    "",
    "Coach reflection:",
    "Evidence is behavioural and specific. Avoid over-interpreting identity or character.",
    "Keep the next conversation anchored to one live example rather than broad traits.",
    "",
    "Prior context:",
    prior,
  ].join("\n");
}

function buildDebriefNotes(coachNotes, agreedAction) {
  return [
    coachNotes,
    "",
    `What surprised me: The concrete example made the pattern clearer than previous general discussion.`,
    `What shifted: A more precise behavioural description and a usable next experiment.`,
    `What worked: Staying with one incident rather than collecting many.`,
    `What I would do differently: Arrive even faster at the enacted behaviour under pressure.`,
    `Commitments: ${agreedAction}`,
  ].join("\n\n");
}

function reviewSummary(content) {
  const issues = [];
  const summary = content?.sessionSummary?.trim() || "";
  const words = wordCount(summary);
  if (words < 140) issues.push(`sessionSummary too short (${words} words)`);
  if (words > 320) issues.push(`sessionSummary too long (${words} words)`);
  if ((content?.keyInsights?.length || 0) < 1) {
    issues.push("missing keyInsights");
  }
  if ((content?.keyInsights?.length || 0) > 3) {
    content.keyInsights = content.keyInsights.slice(0, 3);
  }
  if ((content?.strengths?.length || 0) < 1) issues.push("missing strengths");
  if ((content?.developmentEvidence?.length || 0) < 1) {
    issues.push("missing developmentEvidence");
  }
  if (!(content?.coachingContext || "").trim()) {
    issues.push("missing coachingContext");
  }
  // Reject topic-tag style insights (title only / tiny description).
  for (const item of content?.keyInsights || []) {
    if (wordCount(item.description) < 8) {
      issues.push(`thin keyInsight: ${item.title}`);
    }
  }
  return issues;
}

function reviewDevelopment(generation) {
  const issues = [];
  if (!generation?.hasMeaningfulChanges) {
    issues.push("no meaningful changes");
  }
  if (!hasAnyProposedChanges(generation?.proposedChanges || {})) {
    issues.push("empty proposedChanges");
  }
  const changes = generation?.proposedChanges || {};
  const themeAdds = changes.emergingThemes?.add?.length || 0;
  const strengthAdds =
    (changes.strengths?.add?.length || 0) +
    (changes.strengths?.update?.length || 0);
  const growthAdds = changes.growthAreas?.add?.length || 0;
  if (themeAdds + strengthAdds + growthAdds < 2) {
    issues.push("insufficient profile enrichment");
  }
  if (!(generation?.conversationSummary || "").trim()) {
    issues.push("missing conversationSummary");
  }
  if (!(generation?.evidence || []).length) {
    issues.push("missing evidence");
  }
  return issues;
}

async function callOpenAI(openai, { instructions, input }, identities = {}) {
  const response = await createPersonLevelResponse(
    openai,
    {
      model: MODEL,
      instructions,
      input,
    },
    identities
  );
  const text = response.output_text?.trim();
  if (!text) throw new Error("Empty model response.");
  return text;
}

function coachReviewSummary(content) {
  const issues = reviewSummary(content);
  if (issues.length) {
    throw new Error(`Summary failed coach review: ${issues.join("; ")}`);
  }
  return { content, coachReviewed: true, attempt: 1 };
}

async function generateSummary(openai, notes, composeInput = null, identities = {}) {
  if (composeMode || !openai) {
    if (!composeInput) throw new Error("composeInput required in compose mode");
    const content = composeSummaryContent(composeInput);
    // Re-parse via production serialise → normalise path for schema fidelity.
    const fields = serialiseSummaryContent(content);
    const roundTrip = parseSummaryInsightsFromModel(
      JSON.stringify({
        sessionSummary: fields.summary,
        keyInsights: content.keyInsights,
        strengths: content.strengths,
        developmentEvidence: content.developmentEvidence,
        coachingContext: fields.valuesBecomingVisible,
        commitments: content.commitments,
        possibleNextFocus: content.possibleNextFocus,
        evidenceQualification: content.evidenceQualification,
      })
    );
    return coachReviewSummary(roundTrip || content);
  }

  let lastIssues = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const addon =
      attempt === 1
        ? DEMO_SUMMARY_ADDENDUM
        : `${DEMO_SUMMARY_ADDENDUM}\nPrevious draft failed coach review: ${lastIssues.join("; ")}. Improve specificity and completeness.`;
    const raw = await callOpenAI(
      openai,
      {
        instructions: `${DRAFT_SUMMARY_INSTRUCTIONS}\n${addon}`,
        input: buildDraftSummaryInput(notes),
      },
      identities
    );
    const content = parseSummaryInsightsFromModel(raw);
    if (!content) {
      lastIssues = ["unparseable JSON"];
      continue;
    }
    const issues = reviewSummary(content);
    if (issues.length === 0) {
      return { content, coachReviewed: true, attempt };
    }
    lastIssues = issues;
  }
  throw new Error(`Summary failed coach review: ${lastIssues.join("; ")}`);
}

async function generateDevelopmentUpdate(openai, input, composeInput = null, identities = {}) {
  if (composeMode || !openai) {
    if (!composeInput) throw new Error("composeInput required in compose mode");
    const generation = composeDevelopmentUpdate(composeInput);
    const issues = reviewDevelopment(generation);
    if (issues.length) {
      throw new Error(
        `Development update failed coach review: ${issues.join("; ")}`
      );
    }
    return { generation, coachReviewed: true, attempt: 1 };
  }

  let lastIssues = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const addon =
      attempt === 1
        ? DEMO_DEVELOPMENT_ADDENDUM
        : `${DEMO_DEVELOPMENT_ADDENDUM}
Previous draft failed coach review: ${lastIssues.join("; ")}.
Return valid JSON only.
Every add item must include value (string) and status (emerging|supported|well_established).
evidence[].changeKey must look like emergingThemes.add.0 or strengths.add.0.
Propose at least two evidenced adds across emergingThemes, strengths and growthAreas.`;
    const raw = await callOpenAI(
      openai,
      {
        instructions: `${DEVELOPMENT_UPDATE_SYSTEM_PROMPT}\n${addon}`,
        input: buildDevelopmentUpdateInput(input),
      },
      identities
    );
    let generation;
    try {
      generation = parseDevelopmentUpdateGeneration(raw);
    } catch (error) {
      lastIssues = [
        `schema invalid: ${error instanceof Error ? error.message.slice(0, 180) : "unknown"}`,
      ];
      console.warn(`  ! development schema retry ${attempt}: ${lastIssues[0]}`);
      continue;
    }
    const issues = reviewDevelopment(generation);
    if (issues.length === 0) {
      return { generation, coachReviewed: true, attempt };
    }
    lastIssues = issues;
    console.warn(
      `  ! development quality retry ${attempt}: ${issues.join("; ")}`
    );
  }
  throw new Error(
    `Development update failed coach review: ${lastIssues.join("; ")}`
  );
}

function loadCheckpoint() {
  if (force || !existsSync(cachePath)) {
    return { relationships: {} };
  }
  try {
    return JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    return { relationships: {} };
  }
}

function saveCheckpoint(checkpoint) {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(checkpoint, null, 2) + "\n");
}

function writeJson(name, data) {
  writeFileSync(join(outDir, name), JSON.stringify(data, null, 2) + "\n");
}

function titleCaseTheme(themeKey) {
  return themeKey
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  const errors = [];
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      try {
        results[current] = await worker(items[current], current);
      } catch (error) {
        errors.push({
          item: items[current],
          error,
        });
        console.error(
          `✗ ${items[current]?.key || current}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  );
  if (errors.length) {
    throw new Error(
      `${errors.length} relationship(s) failed. Re-run to resume from checkpoint.`
    );
  }
  return results;
}

async function rebuildRelationship(openai, rel, checkpoint) {
  if (!force && checkpoint.relationships[rel.key]?.complete) {
    console.log(`✓ cache hit ${rel.key}`);
    return checkpoint.relationships[rel.key].payload;
  }

  console.log(`→ generating ${rel.key}`);
  const themeKeys = [
    rel.themes[0],
    rel.themes[1] ?? rel.themes[0],
    rel.themes[2] ?? rel.themes[0],
    rel.themes[0],
    rel.themes[1] ?? rel.themes[0],
    rel.themes[2] ?? rel.themes[0],
  ];

  const profile = emptyProfile(rel.currentFocus);
  const priorSummaries = [];
  const sessions = [];
  const actions = [];
  const developmentUpdates = [];
  const intelligenceItems = [];
  let updateSeq = 0;

  for (let i = 0; i < 6; i += 1) {
    const themeKey = themeKeys[i];
    const arc = ARC[themeKey] || ARC.confidence;
    const focus = arc.foci[i];
    const days = 84 - i * 12 - (RELATIONSHIPS.indexOf(rel) % 3);
    const sessionKey = `${rel.key}-session-${i + 1}`;
    const agreedAction = [
      "Bring one concrete behavioural example to the next conversation",
      "Complete the agreed experiment and note what changed under pressure",
      "Protect the practised opening, brief or pause before the next forum",
      "Hold the delayed conversation or handoff within five working days",
      "Repeat the successful behaviour once in a harder setting",
      "Choose one sustaining habit and one risk situation for the fortnight",
    ][i];

    const coachNotes = buildCoachNotes(rel, i, themeKey, priorSummaries);
    const notesForAi = buildDebriefNotes(coachNotes, agreedAction);

    const identities = identitiesForRelationship(rel);
    const { content } = await generateSummary(
      openai,
      notesForAi,
      {
      personName: personLabel(rel),
      role: rel.role,
      organisationLabel: rel.organisationLabel,
      programmeFocus: rel.currentFocus,
      themeKey,
      focus,
      incident: arc.incidents[i],
      sessionIndex: i,
      agreedAction,
      priorSummary: priorSummaries[priorSummaries.length - 1] || "",
      },
      identities
    );
    const fields = serialiseSummaryContent(content);
    priorSummaries.push(fields.summary);

    const session = {
      key: sessionKey,
      relationshipKey: rel.key,
      sessionNumber: i + 1,
      sessionDate: daysAgo(days),
      displayDate: daysAgo(days),
      displayTime: i % 2 === 0 ? "10:00" : "14:30",
      startsAt: isoDaysAgo(days, i % 2 === 0 ? 10 : 14),
      status: "completed",
      title: `Conversation ${i + 1}`,
      durationMinutes: 60,
      focus,
      preparation: `Review recent examples of ${themeKey.replace(/_/g, " ")} and one live incident from the last fortnight.`,
      notes: coachNotes,
      privateNotes: "",
      emergingThemes: fields.emergingThemes,
      strengthsObserved: fields.strengthsObserved,
      valuesBecomingVisible: fields.valuesBecomingVisible,
      professionalIdentityDevelopment: fields.professionalIdentityDevelopment,
      agreedActions: fields.agreedActions || agreedAction,
      suggestedFocus: fields.suggestedFocus,
      coachReflection: fields.coachReflection,
      summary: fields.summary,
      aiSummaryApproved: true,
      completedAt: isoDaysAgo(days, i % 2 === 0 ? 11 : 15),
      themeKeys: rel.themes,
      _structured: content,
    };
    sessions.push(session);

    actions.push({
      key: `${rel.key}-action-${i + 1}`,
      relationshipKey: rel.key,
      sessionKey,
      title:
        (content.commitments && content.commitments[0]) ||
        agreedAction.slice(0, 120),
      notes: `Linked to ${themeKey.replace(/_/g, " ")}.`,
      owner: personLabel(rel),
      status: i <= 3 ? "Completed" : "Open",
      due: daysAgo(Math.max(days - 14, 5)),
      themeKey,
    });

    // Development updates after conversations 2 and 6 so the final profile
    // includes the full six-conversation arc.
    if (i === 1 || i === 5) {
      updateSeq += 1;
      const previousSessions = sessions
        .slice(0, -1)
        .slice(-5)
        .map(
          s =>
            `- ${s.sessionDate} · ${s.title}: ${s.summary.slice(0, 280)} | themes: ${s.emergingThemes.slice(0, 160)}`
        )
        .join("\n");

      const { generation } = await generateDevelopmentUpdate(
        openai,
        {
          personContext: [
            `Name: ${personLabel(rel)}`,
            `Role: ${rel.role}`,
            `Organisation: ${rel.organisationLabel}`,
            `Current focus: ${rel.currentFocus}`,
            rel.identityMode === "confidential"
              ? "Identity mode: confidential (do not invent a personal name)."
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          developmentProfile: formatProfileForPrompt(profile),
          previousSessions: previousSessions || "(none)",
          approvedIntelligence: "(none)",
          sessionNotes: coachNotes,
          approvedSummary: fields.summary,
          commitments: fields.agreedActions || agreedAction,
          coachReflection: fields.coachReflection || "",
        },
        {
          personName: personLabel(rel),
          themeKey,
          focus,
          sessionIndex: i,
          summary: fields.summary,
          profile,
        },
        identities
      );

      Object.assign(profile, applyProposedChanges(profile, generation.proposedChanges));

      developmentUpdates.push({
        key: `${rel.key}-update-${updateSeq}`,
        relationshipKey: rel.key,
        sessionKey,
        status: "applied",
        conversationSummary: generation.conversationSummary,
        hasMeaningfulChanges: true,
        proposedChanges: generation.proposedChanges,
        evidenceSummary: (generation.evidence || []).map(item => ({
          changeKey: item.changeKey,
          evidenceText: item.evidenceText,
          sourceExcerpt: item.sourceExcerpt || focus,
        })),
        coachNote: "Coach-reviewed and accepted for the Northbridge demonstration pack.",
        generatedAt: isoDaysAgo(days - 1, 16),
        reviewedAt: isoDaysAgo(days - 1, 17),
        appliedAt: isoDaysAgo(days - 1, 18),
      });
    }

    const insight = content.keyInsights?.[0];
    const strength = content.strengths?.[0];
    const intel =
      i % 2 === 0
        ? {
            category: "recurring_theme",
            title: titleCaseTheme(themeKey),
            description:
              insight?.description ||
              `Recurring theme of ${themeKey.replace(/_/g, " ")} evidenced across coaching conversations.`,
          }
        : strength
          ? {
              category: "strength",
              title: strength.title,
              description: strength.description,
            }
          : {
              category: "recurring_theme",
              title: titleCaseTheme(themeKey),
              description: `Recurring theme of ${themeKey.replace(/_/g, " ")}.`,
            };

    intelligenceItems.push({
      key: `${rel.key}-intel-${i + 1}`,
      relationshipKey: rel.key,
      sessionKey,
      category: intel.category,
      title: intel.title,
      description: intel.description,
      status: "approved",
      confidenceScore: 60 + i * 5,
      confidenceLabel:
        i < 2 ? "emerging" : i < 4 ? "supported" : "strongly supported",
      sourceType: "coach_observation",
      firstIdentifiedAt: isoDaysAgo(days + 2, 9),
      approvedAt: isoDaysAgo(days, 12),
      themeKey,
      evidenceText: (session.summary || "").slice(0, 220),
    });

    console.log(`  · ${rel.key} conversation ${i + 1} frozen`);
  }

  // Strip internal structured payload before freezing sessions.
  const frozenSessions = sessions.map(({ _structured, ...rest }) => rest);

  const payload = {
    sessions: frozenSessions,
    actions,
    developmentUpdates,
    intelligenceItems,
    finalProfile: profile,
  };

  checkpoint.relationships[rel.key] = { complete: true, payload };
  saveCheckpoint(checkpoint);
  console.log(`✓ frozen ${rel.key}`);
  return payload;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!composeMode && !apiKey) {
    console.error("OPENAI_API_KEY missing. Load .env.local first.");
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  if (composeMode) {
    console.log(
      "Compose mode: using production serialisers + coach-review gates. Live OpenAI cache hits are preserved."
    );
  }

  const openai = composeMode ? null : new OpenAI({ apiKey });
  const checkpoint = loadCheckpoint();
  const targets = onlyRel
    ? RELATIONSHIPS.filter(r => r.key === onlyRel)
    : RELATIONSHIPS;

  if (targets.length === 0) {
    console.error(`No relationship matched ${onlyRel}`);
    process.exit(1);
  }

  const payloads = await mapPool(
    targets,
    composeMode ? Math.max(concurrency, 4) : concurrency,
    async rel => rebuildRelationship(openai, rel, checkpoint)
  );

  // If rebuilding a subset, merge with existing pack files where possible.
  let allSessions = [];
  let allActions = [];
  let allUpdates = [];
  let allIntel = [];

  if (onlyRel && existsSync(join(outDir, "sessions.json"))) {
    allSessions = JSON.parse(readFileSync(join(outDir, "sessions.json"), "utf8"))
      .sessions;
    allActions = JSON.parse(readFileSync(join(outDir, "actions.json"), "utf8"))
      .actions;
    allUpdates = JSON.parse(
      readFileSync(join(outDir, "development-updates.json"), "utf8")
    ).developmentUpdates;
    allIntel = JSON.parse(
      readFileSync(join(outDir, "intelligence-items.json"), "utf8")
    ).intelligenceItems;

    const drop = key => !String(key).startsWith(`${onlyRel}-`);
    allSessions = allSessions.filter(s => drop(s.key));
    allActions = allActions.filter(a => drop(a.key));
    allUpdates = allUpdates.filter(u => drop(u.key));
    allIntel = allIntel.filter(i => drop(i.key));
  }

  for (const payload of payloads) {
    allSessions.push(...payload.sessions);
    allActions.push(...payload.actions);
    allUpdates.push(...payload.developmentUpdates);
    allIntel.push(...payload.intelligenceItems);
  }

  // Stable ordering by relationship list then session number.
  const relOrder = new Map(RELATIONSHIPS.map((r, i) => [r.key, i]));
  const byRelSession = (a, b) => {
    const ra = relOrder.get(a.relationshipKey) ?? 0;
    const rb = relOrder.get(b.relationshipKey) ?? 0;
    if (ra !== rb) return ra - rb;
    return (a.sessionNumber || 0) - (b.sessionNumber || 0);
  };
  allSessions.sort(byRelSession);
  allActions.sort((a, b) => {
    const ra = relOrder.get(a.relationshipKey) ?? 0;
    const rb = relOrder.get(b.relationshipKey) ?? 0;
    if (ra !== rb) return ra - rb;
    return String(a.key).localeCompare(String(b.key));
  });
  allUpdates.sort((a, b) => {
    const ra = relOrder.get(a.relationshipKey) ?? 0;
    const rb = relOrder.get(b.relationshipKey) ?? 0;
    if (ra !== rb) return ra - rb;
    return String(a.key).localeCompare(String(b.key));
  });
  allIntel.sort((a, b) => {
    const ra = relOrder.get(a.relationshipKey) ?? 0;
    const rb = relOrder.get(b.relationshipKey) ?? 0;
    if (ra !== rb) return ra - rb;
    return String(a.key).localeCompare(String(b.key));
  });

  const organisation = {
    name: ORGANISATION_LABEL,
    slugHint: "northbridge-healthcare-trust-sample",
    organisationType: "public_sector",
    defaultPreparationStyle: "guided",
    aiEnabled: true,
    dataRetentionPolicyLabel: "standard",
    licence: {
      planName: "Sample",
      seatsPurchased: 5,
      status: "active",
    },
    description:
      "Fictional healthcare trust used for demonstrations, training and evaluation. Conversation intelligence is generated with the production AI workflow and coach-reviewed before freezing.",
  };

  const relationships = RELATIONSHIPS.map(r => ({
    key: r.key,
    identityMode: r.identityMode,
    name: r.identityMode === "confidential" ? r.displayLabel : r.name,
    displayLabel: r.displayLabel,
    role: r.role,
    organisationLabel: r.organisationLabel,
    email: r.identityMode === "confidential" ? "" : r.email,
    currentFocus: r.currentFocus,
    aiNameAllowed: r.identityMode === "confidential" ? false : r.aiNameAllowed,
    themes: r.themes,
  }));

  const assignments = RELATIONSHIPS.map(r => ({
    relationshipKey: r.key,
    assignmentRole: "primary",
    assignee: "installing_user",
  }));

  const manifest = {
    packKey: "northbridge-healthcare",
    packVersion: PACK_VERSION,
    title: ORGANISATION_LABEL,
    summary:
      "Demonstration coaching environment for Northbridge Healthcare Trust. Intelligence is generated with the production AI workflow, coach-reviewed, and frozen into the pack.",
    locale: "en-GB",
    estimatedSetupSeconds: 60,
    period: {
      start: daysAgo(180),
      end: daysAgo(0),
      label: "Approximately six months",
    },
    expectedCounts: {
      organisations: 1,
      relationships: 12,
      standardRelationships: 10,
      confidentialRelationships: 2,
      sessions: 72,
      actions: 72,
      developmentUpdates: 24,
      intelligenceItems: 72,
      organisationIntelligenceSnapshots: 1,
    },
    features: [
      "12 coaching relationships",
      "72 development conversations",
      "72 actions",
      "24 development updates",
      "72 intelligence items",
      "2 Confidential Coaching examples",
      "6 months of coaching history",
      "Production AI summaries coach-reviewed and frozen",
      "Organisation Intelligence included",
    ],
    recurringThemes: [
      "confidence",
      "delegation",
      "communication",
      "difficult_conversations",
      "strategic_leadership",
      "stakeholder_influence",
    ],
    privacy: {
      minimumThemeRelationships: 5,
      confidentialIdentityMode: "confidential",
      notes: "All names and coaching records in this sample are fictional.",
    },
    files: {
      organisation: "organisation.json",
      relationships: "relationships.json",
      assignments: "assignments.json",
      sessions: "sessions.json",
      actions: "actions.json",
      developmentUpdates: "development-updates.json",
      intelligenceItems: "intelligence-items.json",
    },
  };

  writeJson("manifest.json", manifest);
  writeJson("organisation.json", organisation);
  writeJson("relationships.json", { relationships });
  writeJson("assignments.json", { assignments });
  writeJson("sessions.json", { sessions: allSessions });
  writeJson("actions.json", { actions: allActions });
  writeJson("development-updates.json", {
    developmentUpdates: allUpdates,
  });
  writeJson("intelligence-items.json", {
    intelligenceItems: allIntel,
  });

  // Quality report
  const thin = allSessions.filter(s => wordCount(s.summary) < 140);
  const missingInsights = allSessions.filter(
    s => !String(s.emergingThemes || "").trim()
  );
  const missingStrengths = allSessions.filter(
    s => !String(s.strengthsObserved || "").trim()
  );

  console.log(
    JSON.stringify(
      {
        outDir,
        packVersion: PACK_VERSION,
        relationships: RELATIONSHIPS.length,
        sessions: allSessions.length,
        actions: allActions.length,
        developmentUpdates: allUpdates.length,
        intelligenceItems: allIntel.length,
        thinSummaries: thin.map(s => s.key),
        missingInsights: missingInsights.map(s => s.key),
        missingStrengths: missingStrengths.map(s => s.key),
      },
      null,
      2
    )
  );

  if (
    allSessions.length !== 72 ||
    allUpdates.length !== 24 ||
    thin.length ||
    missingInsights.length ||
    missingStrengths.length
  ) {
    console.error("Pack quality checks failed.");
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
