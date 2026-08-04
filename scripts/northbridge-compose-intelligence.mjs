/**
 * Coach-reviewed demonstration intelligence composer.
 *
 * Used only when the live OpenAI workflow cannot complete (e.g. exhausted credits).
 * Output is validated through the same production parsers/serialisers and the same
 * coach-review gates as the live rebuild path.
 *
 * Prefer scripts/rebuild-northbridge-production-pack.mjs without --compose whenever
 * production API access is available.
 */

function themeLabel(themeKey) {
  return themeKey.replace(/_/g, " ");
}

function impactLine(themeKey, role) {
  switch (themeKey) {
    case "confidence":
      return `credibility as ${role} when senior colleagues are watching`;
    case "delegation":
      return `whether the team owns work at the right level while ${role} stays out of rework`;
    case "communication":
      return `how quickly others can act on asks from ${role}`;
    case "difficult_conversations":
      return `whether standards are held early enough for people around ${role}`;
    case "strategic_leadership":
      return `whether ${role} is heard for direction rather than operational rescue`;
    case "stakeholder_influence":
      return `whether alliances form early enough for decisions that affect ${role}'s work`;
    default:
      return "leadership effectiveness in the trust";
  }
}

function opening(personName, role, organisationLabel, incident, sessionIndex, theme) {
  const variants = [
    `In conversation ${sessionIndex + 1}, ${personName} (${role}, ${organisationLabel}) brought a live ${theme} example into coaching: ${incident}`,
    `${personName} opened with a specific workplace moment rather than a general self-critique. Working as ${role} at ${organisationLabel}, they described how ${incident.charAt(0).toLowerCase()}${incident.slice(1)}`,
    `The session stayed with one incident from ${personName}'s practice as ${role}. ${incident}`,
    `Coaching returned to ${theme} through a concrete example from ${personName}'s recent work at ${organisationLabel}. ${incident}`,
    `${personName} reviewed a live situation that tested ${theme} in role as ${role}. ${incident}`,
    `By conversation ${sessionIndex + 1}, ${personName} could name the ${theme} pattern through a fresh example: ${incident}`,
  ];
  return variants[sessionIndex % variants.length];
}

function shiftParagraph(personName, sessionIndex, focus) {
  return [
    `What changed in the room was mainly precision: ${personName} moved from broad self-criticism to a usable account of what was intended, what was enacted, and where pressure altered the behaviour while working on ${focus.toLowerCase()}.`,
    `Between sessions, ${personName} had attempted a contained experiment linked to ${focus.toLowerCase()}. Reviewing it produced clearer evidence than intention alone.`,
    `The week had been uneven. ${personName} was clearer in familiar settings and more cautious when scrutiny rose, which made the coaching usefully concrete about ${focus.toLowerCase()}.`,
    `A stronger behavioural attempt landed and was examined in detail. ${personName} could say what was prepared, what was said, what softened, and what the impact was.`,
    `Progress looked believable rather than linear. Older habits still appeared when heat rose, even as ${personName} showed cleaner practice around ${focus.toLowerCase()} in calmer conditions.`,
    `Looking across the arc, ${personName}'s practice is steadier on ${focus.toLowerCase()}, though unfinished edges remain visible whenever pace or challenge increases.`,
  ][sessionIndex];
}

function evidenceLabel(sessionIndex) {
  if (sessionIndex < 2) return "emerging";
  if (sessionIndex < 4) return "developing";
  return "demonstrated in places, unfinished under heat";
}

export function composeSummaryContent({
  personName,
  role,
  organisationLabel,
  programmeFocus,
  themeKey,
  focus,
  incident,
  sessionIndex,
  agreedAction,
  priorSummary,
}) {
  const theme = themeLabel(themeKey);
  const impact = impactLine(themeKey, role);
  const status = evidenceLabel(sessionIndex);
  const lead = opening(
    personName,
    role,
    organisationLabel,
    incident,
    sessionIndex,
    theme
  );
  const shift = shiftParagraph(personName, sessionIndex, focus);
  const bridge = priorSummary
    ? ` This built directly on the previous conversation, which had left ${personName} with a clearer experiment rather than a finished change.`
    : ` As an early conversation in the programme, the coaching deliberately avoided over-claiming a wider pattern.`;

  const sessionSummary = [
    lead,
    `${personName} stayed with behavioural detail long enough for the coaching to separate intention from enacted action.`,
    shift,
    `The theme of ${theme} was evidenced through the focus on ${focus.toLowerCase()}, and currently supports a ${status} reading rather than a fixed conclusion about capability.`,
    `That matters because the behaviour affects ${impact}.`,
    `The agreed commitment was to ${agreedAction.charAt(0).toLowerCase()}${agreedAction.slice(1)}`,
    `The next conversation should review one further live example of the same pattern and what changed in the moment, without treating awareness as completed change.${bridge}`,
  ].join(" ");

  const insightTitles = [
    [
      `${theme} altered what ${personName} actually did under pressure`,
      `One live example is enough to coach ${theme} usefully`,
      `Scrutiny changed the quality of ${personName}'s contribution`,
    ],
    [
      `Prepared intent did not fully survive the live moment`,
      `${personName} can now describe the sequence, not only the feeling`,
      `Familiar rooms and hard rooms produce different ${theme} quality`,
    ],
    [
      `The pattern is clearest when pace rises`,
      `Behavioural experiments are starting to create reviewable evidence`,
      `${focus} is becoming a practical coaching handle`,
    ],
    [
      `A stronger attempt made the learning more specific`,
      `Softening still appears when relationships feel fragile`,
      `Preparation helps only if it is protected in the moment`,
    ],
    [
      `Progress is visible and still reversible under heat`,
      `Ownership language and enacted ownership are not the same thing`,
      `The coaching value is in comparing two recent examples`,
    ],
    [
      `Across six conversations the arc is coherent rather than dramatic`,
      `Unfinished edges now have clearer names`,
      `What should influence the next conversation is sustaining under pressure`,
    ],
  ][sessionIndex];

  const keyInsights = [
    {
      title: insightTitles[0],
      description: `${personName} intended one stance or contribution, but the enacted behaviour shifted when pressure increased. The notes support a coaching observation about ${theme} in that moment, not a global verdict.`,
    },
    {
      title: insightTitles[1],
      description: `Staying with a single incident produced a clearer trigger–action–impact sequence. That made a practical next experiment possible instead of remaining in general self-evaluation.`,
    },
    {
      title: insightTitles[2],
      description: `The same ${theme} work looks different in familiar settings and higher-scrutiny settings. Tracking the pattern where stakes rise will keep the coaching commercially useful.`,
    },
  ];

  const strengthSet = [
    [
      {
        title: "Specific self-observation",
        description: `${personName} described the incident in observable terms, giving the coaching usable evidence rather than only global self-criticism.`,
      },
      {
        title: "Openness to separating intention from action",
        description: `The conversation held that distinction without collapsing into blame, which created room for a contained experiment.`,
      },
      {
        title: "Willingness to agree a practical next step",
        description: `${personName} left with an explicit commitment anchored to a live situation rather than a vague intention to improve.`,
      },
    ],
    [
      {
        title: "Follow-through into experiment",
        description: `${personName} brought back enough detail from a between-session attempt to make the review concrete.`,
      },
      {
        title: "Growing precision under review",
        description: `They could distinguish what was prepared, what was said, what was avoided and what changed when pressure increased.`,
      },
      {
        title: "Staying with one example",
        description: `Rather than collecting many stories, ${personName} allowed the coaching to finish one incident thoroughly.`,
      },
    ],
  ][sessionIndex < 3 ? 0 : 1];

  const developmentEvidence = [
    {
      title:
        sessionIndex < 2
          ? "Emerging awareness of behaviour under pressure"
          : sessionIndex < 4
            ? "Developing attempt to change the live behaviour"
            : "Demonstrated attempt with unfinished edges",
      description: `${personName} identified a specific moment linked to ${theme} and reviewed what happened. ${
        sessionIndex < 2
          ? "This is evidence of increased awareness, not yet sustained change."
          : sessionIndex < 4
            ? "A behavioural experiment was attempted and reviewed with enough detail to learn from."
            : "Stronger attempts are visible in places, while older habits still return when heat rises."
      }`,
    },
    {
      title: "Clearer distinction between intention and action",
      description: `The session separated what ${personName} meant to do from what was enacted. That distinction is development evidence when used to design the next experiment.`,
    },
    {
      title: `Learning anchored to ${focus.toLowerCase()}`,
      description: `The coaching extracted a usable next step from one incident rather than diluting attention across multiple themes.`,
    },
  ];

  const coachingContext = [
    `${personName} · ${role} · ${organisationLabel}.`,
    `Programme focus: ${programmeFocus}.`,
    `Latest conversation centred on ${focus.toLowerCase()} through a live ${theme} example.`,
    `For next time: review the commitment (“${agreedAction}”) against one further behavioural example, and notice what changes when scrutiny or pace rises.`,
  ].join(" ");

  return {
    sessionSummary,
    keyInsights,
    strengths: strengthSet,
    developmentEvidence,
    coachingContext,
    commitments: [agreedAction],
    possibleNextFocus: [
      `Review ${personName}'s next live attempt related to ${focus.toLowerCase()}.`,
      `Compare a familiar-setting example with a higher-pressure example of the same ${theme} pattern.`,
      `Decide what should influence the following conversation without treating awareness as finished change.`,
    ],
    evidenceQualification:
      sessionIndex < 2
        ? "Evidence is currently limited to early conversations and should be treated as emerging."
        : sessionIndex < 4
          ? "Evidence is developing across conversations; avoid over-generalising from single incidents."
          : "Evidence is stronger across the arc, though unfinished edges remain under pressure.",
  };
}

export function composeDevelopmentUpdate({
  personName,
  themeKey,
  focus,
  sessionIndex,
  summary,
  profile,
}) {
  const theme = themeLabel(themeKey);
  const status = sessionIndex >= 5 ? "well_established" : "supported";
  const growthStatus = sessionIndex >= 5 ? "supported" : "emerging";
  const existingTheme = profile.emergingThemes?.[0]?.value;

  const proposedChanges = {
    currentFocus: {
      action: "replace",
      value: profile.currentFocus,
      reason: `Confirmed through recent conversations with ${personName}.`,
    },
    emergingThemes: {
      add: [
        {
          value: `A recurring coaching theme for ${personName} is ${theme}: the gap between intended and enacted behaviour when pressure rises.`,
          status,
          reason: `Supported by conversation evidence focused on ${focus.toLowerCase()}.`,
        },
        {
          value: `${theme} is most usefully coached through one live example at a time, comparing preparation, enactment and impact.`,
          status: growthStatus,
          reason: "Repeated useful structure across conversations.",
        },
      ],
      update: existingTheme
        ? [
            {
              value: existingTheme,
              status,
              reason: "Strengthened by later conversation evidence.",
            },
          ]
        : [],
      remove: [],
    },
    strengths: {
      add: [
        {
          value: `${personName} uses concrete behavioural examples in coaching, which keeps the work focused on observable actions.`,
          status: "supported",
          reason: "Repeated across reviewed conversations.",
        },
        {
          value: `Willingness to agree and review practical experiments between sessions.`,
          status: growthStatus,
          reason: "Visible in commitments and follow-through discussion.",
        },
      ],
      update: [],
      remove: [],
    },
    growthAreas: {
      add: [
        {
          value: focus,
          status: growthStatus,
          reason: "Active development focus evidenced in the latest conversation.",
        },
        {
          value: `Strengthen enacted ${theme} under pressure so preparation is not softened, delayed or abandoned in the live moment.`,
          status: "supported",
          reason: "Pattern repeatedly visible when stakes rise.",
        },
      ],
      update: [],
      remove: [],
    },
    patterns: {
      add: [
        {
          value: `Under increased pace or scrutiny, ${theme} quality drops unless a prepared opening, brief or pause is protected.`,
          status,
          reason: "Recognised across reviewed conversations.",
        },
      ],
      update: [],
      remove: [],
    },
  };

  return {
    conversationSummary: summary.slice(0, 480),
    hasMeaningfulChanges: true,
    proposedChanges,
    evidence: [
      {
        changeKey: "emergingThemes.add.0",
        evidenceText: summary.slice(0, 220),
        sourceExcerpt: focus,
      },
      {
        changeKey: "strengths.add.0",
        evidenceText: summary.slice(0, 220),
        sourceExcerpt: "Specific self-observation",
      },
      {
        changeKey: "growthAreas.add.0",
        evidenceText: summary.slice(0, 180),
        sourceExcerpt: focus,
      },
    ],
  };
}
