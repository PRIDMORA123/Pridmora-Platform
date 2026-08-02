/**
 * Development-only pilot fixtures for Identity Version 1.0 acceptance testing.
 * Do not import or seed these into production.
 */

import type { Client, Session } from "@/lib/types";
import { DEMO_COACH_ID, createBlankSession, normalizeSession } from "@/lib/sessions";

function session(
  partial: Partial<Session> &
    Pick<Session, "id" | "clientId" | "sessionNumber" | "status">
): Session {
  const blank = createBlankSession({
    id: partial.id,
    clientId: partial.clientId,
    coachId: DEMO_COACH_ID,
    sessionNumber: partial.sessionNumber,
    date: partial.date ?? "25 July 2026",
    time: partial.time ?? "10:00",
    focus: partial.focus ?? "",
    preparation: partial.preparation ?? "",
    status: partial.status,
  });
  return normalizeSession(
    { ...blank, ...partial, coachId: DEMO_COACH_ID },
    {
      clientId: partial.clientId,
      coachId: DEMO_COACH_ID,
      index: 0,
      total: 1,
    }
  );
}

function baseClient(
  partial: Pick<Client, "id" | "name" | "initials" | "currentFocus"> &
    Partial<Client>
): Client {
  return {
    organisation: partial.organisation ?? "Pilot Organisation",
    role: partial.role ?? "Leader",
    email: partial.email ?? `${partial.id}@example.com`,
    status: "Active",
    nextSession: "",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: [],
    journey: [],
    ...partial,
  };
}

/** Client A — New relationship: purpose agreed, ready for preparation. */
export const pilotClientA = baseClient({
  id: "pilot-client-a",
  name: "Alex Rivera",
  initials: "AR",
  role: "Operations lead",
  organisation: "North Harbour Trust",
  currentFocus: "Build confidence in senior stakeholder conversations.",
  sessions: [
    session({
      id: "pilot-a-s1",
      clientId: "pilot-client-a",
      sessionNumber: 1,
      status: "planned",
      date: "28 July 2026",
      time: "09:30",
      focus: "Stakeholder confidence",
    }),
  ],
  nextSession: "28 July 2026, 09:30",
});

/** Client B — Prepared: preparation confirmed, ready to start first conversation. */
export const pilotClientB = baseClient({
  id: "pilot-client-b",
  name: "Blair Chen",
  initials: "BC",
  role: "Product director",
  organisation: "Clearline",
  currentFocus: "Lead with clarity while retaining collaborative style.",
  sessions: [
    session({
      id: "pilot-b-s1",
      clientId: "pilot-client-b",
      sessionNumber: 1,
      status: "prepared",
      date: "29 July 2026",
      time: "11:00",
      focus: "Clarity under pressure",
      prepPurpose: "Support Blair to lead with clarity in cross-functional forums.",
      prepTopics: "Stakeholder tension\nDecision ownership",
      prepQuestions: "Where does clarity give way to consensus?",
      prepPrivateNotes: "Blair prepares thoroughly and may underplay authority.",
      prepAiBriefConfirmedAt: "2026-07-25T09:00:00.000Z",
      preparation: "Purpose\nSupport Blair to lead with clarity in cross-functional forums.",
    }),
  ],
  nextSession: "29 July 2026, 11:00",
});

/** Client C — Active: second conversation in progress. */
export const pilotClientC = baseClient({
  id: "pilot-client-c",
  name: "Casey Morgan",
  initials: "CM",
  role: "Clinical lead",
  organisation: "Riverside Health",
  currentFocus: "Balance delivery pressure with sustainable leadership.",
  identitySummary: "Casey is learning to protect judgement under delivery pressure.",
  actions: [
    {
      id: "pilot-c-a1",
      title: "Name one non-negotiable before the next board meeting",
      status: "In progress",
      due: "30 July 2026",
    },
  ],
  sessions: [
    session({
      id: "pilot-c-s1",
      clientId: "pilot-client-c",
      sessionNumber: 1,
      status: "completed",
      date: "10 July 2026",
      completedAt: "2026-07-10T11:00:00.000Z",
      focus: "Protecting judgement",
      summary: "Casey recognised the cost of over-accommodating urgent requests.",
      agreedActions: "Name one non-negotiable before the next board meeting.",
      summaryStatus: "approved",
      aiSummaryApproved: true,
      notes: "Strong reflection on sustainability.",
      notesSavedAt: "2026-07-10T10:50:00.000Z",
    }),
    session({
      id: "pilot-c-s2",
      clientId: "pilot-client-c",
      sessionNumber: 2,
      status: "in_progress",
      date: "25 July 2026",
      time: "14:00",
      focus: "Sustainable leadership under pressure",
      prepPurpose: "Review how Casey protected judgement since the last conversation.",
      prepAiBriefConfirmedAt: "2026-07-24T16:00:00.000Z",
      notes: "Casey described a clearer boundary in this week's planning meeting.",
      notesSavedAt: "2026-07-25T14:20:00.000Z",
    }),
  ],
  nextSession: "25 July 2026, 14:00",
});

/** Client D — Reflection: latest conversation completed, reflection not complete. */
export const pilotClientD = baseClient({
  id: "pilot-client-d",
  name: "Dana Okonkwo",
  initials: "DO",
  role: "Head of people",
  organisation: "Brightfield",
  currentFocus: "Develop an authentic executive voice.",
  sessions: [
    session({
      id: "pilot-d-s1",
      clientId: "pilot-client-d",
      sessionNumber: 1,
      status: "awaiting_completion",
      date: "24 July 2026",
      time: "15:30",
      focus: "Authentic executive voice",
      notes: "Dana spoke with more conviction when describing values-led decisions.",
      notesSavedAt: "2026-07-24T16:05:00.000Z",
      prepAiBriefConfirmedAt: "2026-07-23T18:00:00.000Z",
    }),
  ],
  nextSession: "24 July 2026, 15:30",
});

/** Client E — Development: reflection complete, development update awaiting review. */
export const pilotClientE = baseClient({
  id: "pilot-client-e",
  name: "Elliot Park",
  initials: "EP",
  role: "Engineering manager",
  organisation: "Summit Systems",
  currentFocus: "Grow from technical excellence into people leadership.",
  identitySummary: "Elliot is beginning to define leadership beyond technical delivery.",
  sessions: [
    session({
      id: "pilot-e-s1",
      clientId: "pilot-client-e",
      sessionNumber: 1,
      status: "completed",
      date: "22 July 2026",
      completedAt: "2026-07-22T12:00:00.000Z",
      focus: "People leadership identity",
      summary: "Elliot connected mentoring moments with a clearer leadership identity.",
      coachReflection: "Notice when Elliot leads through questions rather than answers.",
      reflectWhatShifted: "Less reliance on being the technical expert in the room.",
      summaryStatus: "approved",
      aiSummaryApproved: true,
      notes: "Strong examples of mentoring in sprint reviews.",
      notesSavedAt: "2026-07-22T11:40:00.000Z",
    }),
  ],
});

/** Client F — Established: multiple completed conversations with emerging patterns. */
export const pilotClientF = baseClient({
  id: "pilot-client-f",
  name: "Francesca Hale",
  initials: "FH",
  role: "Managing partner",
  organisation: "Hale & Co",
  currentFocus: "Sustain influence without overworking the practice.",
  identitySummary:
    "Francesca is shifting from heroic delivery towards distributed leadership and clearer boundaries.",
  coachInsight:
    "Francesca becomes most energised when discussing contribution through others rather than personal output.",
  strengths: [
    {
      id: "pilot-f-s1",
      name: "Strategic judgement",
      stage: "Established",
      evidence: "Repeatedly connects partner decisions to long-term firm health.",
    },
    {
      id: "pilot-f-s2",
      name: "Boundary setting",
      stage: "Developing",
      evidence: "Beginning to decline work that dilutes leadership focus.",
    },
  ],
  themes: ["Influence", "Boundaries", "Distributed leadership"],
  actions: [
    {
      id: "pilot-f-a1",
      title: "Delegate one partner meeting preparation this week",
      status: "Complete",
    },
    {
      id: "pilot-f-a2",
      title: "Protect two deep-work mornings",
      status: "In progress",
      due: "1 August 2026",
    },
  ],
  sessions: [
    session({
      id: "pilot-f-s1",
      clientId: "pilot-client-f",
      sessionNumber: 1,
      status: "completed",
      date: "1 May 2026",
      completedAt: "2026-05-01T10:00:00.000Z",
      focus: "Heroic delivery pattern",
      summary: "Francesca named the cost of being the default resolver.",
      summaryStatus: "approved",
      aiSummaryApproved: true,
      notes: "Early recognition of overwork pattern.",
      notesSavedAt: "2026-05-01T09:50:00.000Z",
    }),
    session({
      id: "pilot-f-s2",
      clientId: "pilot-client-f",
      sessionNumber: 2,
      status: "completed",
      date: "12 June 2026",
      completedAt: "2026-06-12T10:00:00.000Z",
      focus: "Distributed leadership",
      summary: "Francesca tried delegating a partner preparation and noticed relief.",
      summaryStatus: "approved",
      aiSummaryApproved: true,
      notes: "Practical experiment with delegation.",
      notesSavedAt: "2026-06-12T09:55:00.000Z",
    }),
    session({
      id: "pilot-f-s3",
      clientId: "pilot-client-f",
      sessionNumber: 3,
      status: "completed",
      date: "10 July 2026",
      completedAt: "2026-07-10T10:00:00.000Z",
      focus: "Sustainable influence",
      summary: "Francesca linked influence to enabling others rather than personal output.",
      emergingThemes: "Influence\nBoundaries\nDistributed leadership",
      strengthsObserved: "Strategic judgement\nBoundary setting",
      summaryStatus: "approved",
      aiSummaryApproved: true,
      notes: "Clearer language about contribution through others.",
      notesSavedAt: "2026-07-10T09:50:00.000Z",
    }),
    session({
      id: "pilot-f-s4",
      clientId: "pilot-client-f",
      sessionNumber: 4,
      status: "planned",
      date: "5 August 2026",
      time: "10:00",
      focus: "Protecting leadership capacity",
      prepPurpose: "Review how Francesca sustained boundaries between conversations.",
      prepTopics: "Delegation progress\nCapacity protection",
      prepQuestions: "What would make influence sustainable over the next quarter?",
      prepPrivateNotes: "Watch for slipping back into heroic delivery before busy season.",
      prepAiBriefConfirmedAt: "",
      preparation: "",
    }),
  ],
  nextSession: "5 August 2026, 10:00",
  journey: [
    {
      id: "pilot-f-j1",
      date: "2024",
      title: "Managing partner appointment",
      detail: "Took on broader firm leadership alongside client work.",
    },
    {
      id: "pilot-f-j2",
      date: "Now",
      title: "Sustainable influence",
      detail: "Working to distribute leadership and protect capacity.",
    },
  ],
});

/** All pilot personas for local acceptance testing. Never seed into production. */
export const pilotFixtures: Client[] = [
  pilotClientA,
  pilotClientB,
  pilotClientC,
  pilotClientD,
  pilotClientE,
  pilotClientF,
];

export const pilotFixtureMeta = {
  environment: "development" as const,
  description:
    "Representative coaching relationships for Identity Version 1.0 pilot acceptance testing.",
  clients: {
    A: "New relationship — purpose agreed, ready for preparation",
    B: "Prepared — ready to start first conversation",
    C: "Active — second conversation in progress",
    D: "Reflection — awaiting reflection completion",
    E: "Development — update awaiting review (pair with ready_for_review update in tests)",
    F: "Established — multiple completed conversations with emerging patterns",
  },
};
