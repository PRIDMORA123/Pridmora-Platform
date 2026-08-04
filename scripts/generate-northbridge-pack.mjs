/**
 * Offline template generator for Northbridge pack structure checks.
 *
 * Demonstration pack intelligence is produced by the production AI rebuild:
 *   node --import ./scripts/ts-alias-loader.mjs --experimental-strip-types \
 *     scripts/rebuild-northbridge-production-pack.mjs
 *
 * Do not use this template generator to overwrite the demonstration pack
 * unless you intentionally want non-AI placeholder content.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "sample-data", "northbridge-healthcare");
mkdirSync(outDir, { recursive: true });

const ORGANISATION_LABEL = "Northbridge Healthcare Trust";
const PACK_VERSION = "1.0.0-templates";

/** Anchor end date: ~today relative for six months of history. */
const ANCHOR = new Date("2026-08-04T12:00:00.000Z");

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

const THEME_COPY = {
  confidence: {
    focus: ["Building steadiness under pressure", "Speaking with clearer authority", "Holding a position in senior forums"],
    notes: [
      "Explored moments where hesitation undercuts authority. Practised naming the decision and the rationale in one breath.",
      "Reviewed a recent meeting. Progress is uneven: clearer in familiar settings, still cautious with senior stakeholders.",
      "Named a pattern of over-preparing before speaking. Agreed a lighter preparation ritual before the next forum.",
    ],
    actions: [
      "Prepare a two-minute position statement before the next leadership meeting",
      "Ask one clarifying question in each senior forum this week",
      "Capture one example of speaking earlier than usual",
    ],
    intelligence: [
      { category: "recurring_theme", title: "Confidence under scrutiny", description: "Recurring theme of steadiness when views are challenged in senior settings." },
      { category: "strength", title: "Quiet preparation", description: "Strong preparation habit that supports clearer contributions when used lightly." },
      { category: "development_opportunity", title: "Earlier contribution", description: "Opportunity to contribute earlier rather than waiting for a perfect answer." },
    ],
  },
  delegation: {
    focus: ["Letting go of work that belongs elsewhere", "Setting clearer ownership", "Trusting the handoff"],
    notes: [
      "Mapped work still held personally. Identified three tasks ready to hand over with clearer outcomes.",
      "Reviewed a handoff that slipped. The brief was incomplete rather than the capability of the colleague.",
      "Progress is mixed: some tasks released well, others still pulled back under pressure.",
    ],
    actions: [
      "Hand over one recurring task with a written outcome and check-in point",
      "Ask the owner for their plan before offering solutions",
      "Review one delegated piece after seven days without reworking it",
    ],
    intelligence: [
      { category: "behaviour_pattern", title: "Reclaiming delegated work", description: "Tendency to reclaim tasks when pace increases rather than coaching the owner." },
      { category: "goal", title: "Clearer ownership", description: "Goal to set ownership and outcomes before offering help." },
      { category: "recurring_theme", title: "Delegation under pressure", description: "Delegation quality drops when operational pressure rises." },
    ],
  },
  communication: {
    focus: ["Clearer messages under time pressure", "Listening before advising", "Matching tone to audience"],
    notes: [
      "Practised a shorter message structure: context, ask, next step. Felt more natural by the end of the session.",
      "Explored a conversation that escalated. Listening shortened early and advice arrived too soon.",
      "Noted improvement with peers. Still tightening language for more senior audiences.",
    ],
    actions: [
      "Use a three-part message for one difficult update this week",
      "Pause for ten seconds before offering advice in the next 1:1",
      "Rewrite one email for clarity and send the shorter version",
    ],
    intelligence: [
      { category: "communication_style", title: "Detail-first messaging", description: "Often leads with detail before the ask, which slows decisions." },
      { category: "recurring_theme", title: "Communication clarity", description: "Recurring focus on clearer, shorter communication under pressure." },
      { category: "strength", title: "Thoughtful listening", description: "Listening strength emerges when the pace is protected." },
    ],
  },
  difficult_conversations: {
    focus: ["Naming the issue earlier", "Staying present when challenged", "Balancing candour and care"],
    notes: [
      "Rehearsed an opening line for a delayed feedback conversation. Anxiety reduced once the purpose was clear.",
      "Reviewed a conversation that stayed too polite. Agreed to name the impact next time.",
      "Some progress: one conversation held well. Another was postponed again.",
    ],
    actions: [
      "Schedule the overdue feedback conversation within five working days",
      "Write the opening sentence and the desired outcome beforehand",
      "Ask for the other person's view before sharing a conclusion",
    ],
    intelligence: [
      { category: "emotional_pattern", title: "Avoidance before candour", description: "Delay pattern before difficult conversations, especially with peers." },
      { category: "development_opportunity", title: "Earlier feedback", description: "Opportunity to give feedback closer to the event." },
      { category: "recurring_theme", title: "Difficult conversations", description: "Recurring theme of holding clearer conversations when stakes rise." },
    ],
  },
  strategic_leadership: {
    focus: ["Shifting from operational detail to direction", "Influencing without the formal mandate", "Making trade-offs visible"],
    notes: [
      "Explored where operational depth is valued and where it crowds out strategic contribution.",
      "Practised framing a recommendation with options and a preferred path.",
      "Progress is believable rather than linear: clearer framing in one forum, still detail-heavy in another.",
    ],
    actions: [
      "Bring one recommendation with two options to the next leadership meeting",
      "Protect thirty minutes weekly for horizon thinking",
      "Ask a peer to challenge the strategic frame before presenting",
    ],
    intelligence: [
      { category: "recurring_theme", title: "Strategic leadership", description: "Recurring theme of moving from operational depth to directional leadership." },
      { category: "goal", title: "Visible recommendations", description: "Goal to present clearer recommendations with trade-offs." },
      { category: "behaviour_pattern", title: "Detail as safety", description: "Uses operational detail as safety when the strategic ask is uncertain." },
    ],
  },
  stakeholder_influence: {
    focus: ["Mapping who shapes decisions", "Building alliances earlier", "Influencing without overselling"],
    notes: [
      "Mapped stakeholders for a live initiative. Identified two people to engage before the next decision point.",
      "Reviewed an influence attempt that felt pushy. Agreed to lead with shared interests.",
      "Alliance building is improving. Still underestimates informal influencers.",
    ],
    actions: [
      "Hold one informal conversation with a key stakeholder this week",
      "Update the stakeholder map after the next programme meeting",
      "Ask what success looks like for the other party before pitching",
    ],
    intelligence: [
      { category: "recurring_theme", title: "Stakeholder influence", description: "Recurring theme of building influence across organisational boundaries." },
      { category: "strength", title: "Relationship awareness", description: "Growing awareness of who shapes decisions beyond formal structures." },
      { category: "development_opportunity", title: "Earlier alliance building", description: "Opportunity to engage influencers earlier in the cycle." },
    ],
  },
  accountability: {
    focus: ["Holding standards without micromanaging", "Closing loops on commitments", "Making expectations explicit"],
    notes: [
      "Discussed a missed commitment in the team. Expectations were assumed rather than stated.",
      "Practised a firmer follow-up that stays respectful and specific.",
      "Some improvement in closing loops. Still softens when relationships feel fragile.",
    ],
    actions: [
      "Confirm owners and dates aloud at the end of the next team meeting",
      "Follow up once on a missed commitment within 48 hours",
      "Write the standard expected for one recurring deliverable",
    ],
    intelligence: [
      { category: "recurring_theme", title: "Accountability", description: "Recurring theme of clearer accountability without losing trust." },
      { category: "behaviour_pattern", title: "Softening expectations", description: "Softens expectations when relationships feel at risk." },
      { category: "goal", title: "Closed loops", description: "Goal to close loops on commitments more consistently." },
    ],
  },
  visibility: {
    focus: ["Making contribution visible", "Claiming credit without self-promotion", "Showing up in the right forums"],
    notes: [
      "Explored discomfort with visibility. Separated self-promotion from useful organisational signal.",
      "Planned one visible contribution for the month that serves the team outcome.",
      "Progress is cautious: one update shared well, another deferred.",
    ],
    actions: [
      "Share one concise progress update with the sponsor this week",
      "Volunteer a short input in the next cross-team forum",
      "Ask a colleague to name one contribution worth amplifying",
    ],
    intelligence: [
      { category: "recurring_theme", title: "Visibility", description: "Recurring theme of making contribution visible in the right places." },
      { category: "limiting_belief", title: "Visibility as self-promotion", description: "Belief that visibility equals self-promotion, which limits useful signalling." },
      { category: "development_opportunity", title: "Sponsor updates", description: "Opportunity to keep sponsors informed with short, regular updates." },
    ],
  },
  feedback: {
    focus: ["Giving timely feedback", "Receiving challenge without defensiveness", "Making feedback specific"],
    notes: [
      "Rehearsed specific feedback using behaviour, impact and ask.",
      "Reviewed a moment of defensiveness when receiving challenge. Named the trigger.",
      "Feedback to others is improving. Receiving still needs practice.",
    ],
    actions: [
      "Give one piece of specific feedback within 48 hours of observing it",
      "Ask for feedback on one recent meeting contribution",
      "Use behaviour-impact-ask for the next feedback conversation",
    ],
    intelligence: [
      { category: "recurring_theme", title: "Feedback conversations", description: "Recurring theme of clearer, more timely feedback." },
      { category: "emotional_pattern", title: "Defensiveness under challenge", description: "Early defensiveness when receiving challenge, easing with preparation." },
      { category: "strength", title: "Fair intent", description: "Strong intent to be fair, which supports better feedback when structured." },
    ],
  },
  psychological_safety: {
    focus: ["Creating room for challenge", "Modelling curiosity after mistakes", "Reducing fear of speaking up"],
    notes: [
      "Explored how leadership responses after errors shape what the team shares next.",
      "Practised a response that separates the person from the issue.",
      "Some team members speak more freely. Others still wait to see the reaction.",
    ],
    actions: [
      "Open the next team huddle with a learning from a recent miss",
      "Thank someone publicly for raising a concern",
      "Ask what would make it safer to challenge decisions in this team",
    ],
    intelligence: [
      { category: "recurring_theme", title: "Psychological safety", description: "Recurring theme of building safety for challenge and learning." },
      { category: "behaviour_pattern", title: "Reaction after errors", description: "Immediate reaction after errors still signals risk to some colleagues." },
      { category: "goal", title: "Safer challenge", description: "Goal to make challenge a normal part of team conversation." },
    ],
  },
  coaching_culture: {
    focus: ["Building coaching habits in the team", "Asking before advising", "Protecting development time"],
    notes: [
      "Mapped where advising is default. Identified two moments to ask a coaching question first.",
      "Reviewed a 1:1 that stayed operational. Planned one development question for next time.",
      "Culture shift is slow but visible: a few managers trying shorter coaching turns.",
    ],
    actions: [
      "Use two coaching questions in each 1:1 this week",
      "Protect fifteen minutes in one meeting for development conversation",
      "Share one coaching habit with peer managers",
    ],
    intelligence: [
      { category: "recurring_theme", title: "Coaching culture", description: "Recurring theme of embedding coaching habits beyond formal sessions." },
      { category: "development_opportunity", title: "Ask before advise", description: "Opportunity to ask before advising in operational conversations." },
      { category: "goal", title: "Manager coaching habit", description: "Goal to normalise short coaching turns in management practice." },
    ],
  },
  collaboration: {
    focus: ["Working across service boundaries", "Reducing handoff friction", "Shared problem framing"],
    notes: [
      "Explored a cross-team friction point. Reframed it as a shared system issue rather than a people issue.",
      "Practised inviting the other service into problem definition earlier.",
      "Some improvement in joint planning. Old habits return when incidents spike.",
    ],
    actions: [
      "Invite the neighbouring service to a short joint planning huddle",
      "Agree one shared measure for a handoff this month",
      "Name the friction without blaming in the next incident review",
    ],
    intelligence: [
      { category: "recurring_theme", title: "Collaboration", description: "Recurring theme of collaboration across service boundaries." },
      { category: "behaviour_pattern", title: "Siloed problem framing", description: "Problems framed within the service first, slowing joint solutions." },
      { category: "strength", title: "Practical bridge-building", description: "Practical ability to bridge teams when given a clear shared purpose." },
    ],
  },
  leading_change: {
    focus: ["Holding the narrative of change", "Supporting people through uncertainty", "Keeping pace realistic"],
    notes: [
      "Worked on a clearer change narrative: why now, what stays, what shifts.",
      "Reviewed fatigue in the team. Pace had outstripped communication.",
      "Leadership of change is stronger on intent than on sustained communication.",
    ],
    actions: [
      "Write a one-page change narrative and test it with two colleagues",
      "Hold a listening session before the next milestone",
      "Name what will not change in the next all-hands update",
    ],
    intelligence: [
      { category: "recurring_theme", title: "Leading change", description: "Recurring theme of leading people through organisational change." },
      { category: "development_opportunity", title: "Sustained change narrative", description: "Opportunity to keep the change narrative visible beyond launch." },
      { category: "emotional_pattern", title: "Pace over communication", description: "Tendency to push pace ahead of communication when under delivery pressure." },
    ],
  },
};

const STATUS_ARC = [
  "completed",
  "completed",
  "completed",
  "completed",
  "completed",
  "completed",
];

const ACTION_STATUS_ARC = [
  "Completed",
  "Completed",
  "Open",
  "Completed",
  "Open",
  "Open",
];

const PROGRESS_NOTE = [
  "Steady progress with occasional slips under pressure.",
  "Clearer this month, though old habits returned in one meeting.",
  "Believable improvement rather than a clean breakthrough.",
  "One strong experiment and one postponed conversation.",
  "Confidence rising in familiar settings; still uneven elsewhere.",
  "Practical gains with unfinished edges.",
];

function writeJson(name, data) {
  writeFileSync(join(outDir, name), JSON.stringify(data, null, 2) + "\n");
}

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
    "Fictional healthcare trust used for demonstrations, training and evaluation.",
};

const relationships = RELATIONSHIPS.map((r) => ({
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

const assignments = RELATIONSHIPS.map((r) => ({
  relationshipKey: r.key,
  assignmentRole: "primary",
  assignee: "installing_user",
}));

const sessions = [];
const actions = [];
const developmentUpdates = [];
const intelligenceItems = [];

let sessionSeq = 0;
let actionSeq = 0;
let updateSeq = 0;
let intelSeq = 0;

for (const rel of RELATIONSHIPS) {
  const primaryTheme = rel.themes[0];
  const secondaryTheme = rel.themes[1] ?? rel.themes[0];
  const tertiaryTheme = rel.themes[2] ?? rel.themes[0];
  const themeKeys = [primaryTheme, secondaryTheme, tertiaryTheme, primaryTheme, secondaryTheme, tertiaryTheme];

  for (let i = 0; i < 6; i += 1) {
    sessionSeq += 1;
    const sessionKey = `${rel.key}-session-${i + 1}`;
    // Keep all six conversations inside the Organisation Intelligence 90-day window.
    const days = 84 - i * 12 - (RELATIONSHIPS.indexOf(rel) % 3);
    const themeKey = themeKeys[i];
    const copy = THEME_COPY[themeKey];
    const focus = copy.focus[i % copy.focus.length];
    const notes = `${copy.notes[i % copy.notes.length]} ${PROGRESS_NOTE[i % PROGRESS_NOTE.length]}`;
    const emerging = rel.themes.join(", ").replace(/_/g, " ");

    sessions.push({
      key: sessionKey,
      relationshipKey: rel.key,
      sessionNumber: i + 1,
      sessionDate: daysAgo(days),
      displayDate: daysAgo(days),
      displayTime: i % 2 === 0 ? "10:00" : "14:30",
      startsAt: isoDaysAgo(days, i % 2 === 0 ? 10 : 14),
      status: STATUS_ARC[i],
      title: `Conversation ${i + 1}`,
      durationMinutes: 60,
      focus,
      preparation: `Review recent examples of ${themeKey.replace(/_/g, " ")}.`,
      notes,
      privateNotes: "",
      emergingThemes: emerging,
      strengthsObserved: copy.intelligence.find((x) => x.category === "strength")?.title ?? "Practical reflection",
      valuesBecomingVisible: "Fairness and professional care",
      professionalIdentityDevelopment: focus,
      agreedActions: copy.actions[i % copy.actions.length],
      suggestedFocus: copy.focus[(i + 1) % copy.focus.length],
      coachReflection: PROGRESS_NOTE[(i + 2) % PROGRESS_NOTE.length],
      summary: notes.slice(0, 220),
      aiSummaryApproved: true,
      completedAt: isoDaysAgo(days, i % 2 === 0 ? 11 : 15),
      themeKeys: rel.themes,
    });

    actionSeq += 1;
    const actionCopy = copy.actions[i % copy.actions.length];
    actions.push({
      key: `${rel.key}-action-${i + 1}`,
      relationshipKey: rel.key,
      sessionKey,
      title: actionCopy,
      notes: `Linked to ${themeKey.replace(/_/g, " ")}.`,
      owner: rel.identityMode === "confidential" ? rel.displayLabel : rel.name,
      status: ACTION_STATUS_ARC[i],
      due: daysAgo(Math.max(days - 14, 5)),
      themeKey,
    });

    // 2 development updates per relationship (sessions 2 and 5).
    // These are applied during install via apply_development_update so the
    // development_profiles JSON the Development Intelligence UI reads is populated.
    if (i === 1 || i === 4) {
      updateSeq += 1;
      const entryStatus = i === 4 ? "well_established" : "supported";
      const growthStatus = i === 4 ? "supported" : "emerging";
      const strengthTitles = [];
      const patternTitles = [];
      for (const theme of rel.themes) {
        const themeIntel = THEME_COPY[theme]?.intelligence ?? [];
        for (const item of themeIntel) {
          if (item.category === "strength" && !strengthTitles.includes(item.title)) {
            strengthTitles.push(item.title);
          }
          if (
            (item.category === "behaviour_pattern" ||
              item.category === "emotional_pattern" ||
              item.category === "communication_style") &&
            !patternTitles.includes(item.title)
          ) {
            patternTitles.push(item.title);
          }
        }
      }
      if (strengthTitles.length === 0) {
        strengthTitles.push(
          copy.intelligence.find((x) => x.category === "strength")?.title ??
            "Practical reflection"
        );
      }

      developmentUpdates.push({
        key: `${rel.key}-update-${updateSeq}`,
        relationshipKey: rel.key,
        sessionKey,
        status: "applied",
        conversationSummary: notes.slice(0, 280),
        hasMeaningfulChanges: true,
        proposedChanges: {
          currentFocus: {
            action: "replace",
            value: rel.currentFocus,
            reason: "Confirmed through recent conversations",
          },
          emergingThemes: {
            add: rel.themes.slice(0, 2).map((t) => ({
              value: t.replace(/_/g, " "),
              status: entryStatus,
              reason: "Repeated across conversations",
            })),
          },
          strengths: {
            add: strengthTitles.slice(0, 3).map((value) => ({
              value,
              status: entryStatus,
              reason: "Observed across reviewed conversations",
            })),
          },
          growthAreas: {
            add: [
              {
                value: copy.focus[0],
                status: growthStatus,
                reason: "Active development focus",
              },
            ],
          },
          patterns: {
            add: patternTitles.slice(0, 2).map((value) => ({
              value,
              status: entryStatus,
              reason: "Recognised across reviewed conversations",
            })),
          },
        },
        evidenceSummary: [
          {
            changeKey: "emergingThemes",
            evidenceText: notes.slice(0, 160),
            sourceExcerpt: focus,
          },
          {
            changeKey: "strengths",
            evidenceText: notes.slice(0, 160),
            sourceExcerpt: strengthTitles[0] ?? focus,
          },
        ],
        coachNote: "Sample applied update for evaluation.",
        generatedAt: isoDaysAgo(days - 1, 16),
        reviewedAt: isoDaysAgo(days - 1, 17),
        appliedAt: isoDaysAgo(days - 1, 18),
      });
    }

    // Use catalogue-aligned recurring theme titles so Organisation Intelligence
    // can aggregate across the privacy threshold.
    const catalogueTitle = themeKey.replace(/_/g, " ");
    const intelBase = copy.intelligence[i % copy.intelligence.length];
    const intel =
      intelBase.category === "recurring_theme" || i % 2 === 0
        ? {
            category: "recurring_theme",
            title: catalogueTitle.replace(/\b\w/g, (c) => c.toUpperCase()),
            description: intelBase.description,
          }
        : intelBase;
    intelSeq += 1;
    intelligenceItems.push({
      key: `${rel.key}-intel-${i + 1}`,
      relationshipKey: rel.key,
      sessionKey,
      category: intel.category,
      title: intel.title,
      description: intel.description,
      status: "approved",
      confidenceScore: 55 + (i % 4) * 10,
      confidenceLabel: i < 2 ? "emerging" : i < 4 ? "supported" : "strongly supported",
      sourceType: "coach_observation",
      firstIdentifiedAt: isoDaysAgo(days + 2, 9),
      approvedAt: isoDaysAgo(days, 12),
      themeKey,
      evidenceText: notes.slice(0, 180),
    });
  }
}

const manifest = {
  packKey: "northbridge-healthcare",
  packVersion: PACK_VERSION,
  title: ORGANISATION_LABEL,
  summary:
    "Create a realistic fictional coaching environment for demonstrations, training and evaluation.",
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
writeJson("sessions.json", { sessions });
writeJson("actions.json", { actions });
writeJson("development-updates.json", { developmentUpdates });
writeJson("intelligence-items.json", { intelligenceItems });

console.log(
  JSON.stringify(
    {
      outDir,
      relationships: relationships.length,
      sessions: sessions.length,
      actions: actions.length,
      developmentUpdates: developmentUpdates.length,
      intelligenceItems: intelligenceItems.length,
      confidential: relationships.filter((r) => r.identityMode === "confidential").length,
    },
    null,
    2
  )
);
