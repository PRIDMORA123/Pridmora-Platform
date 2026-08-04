import type { Client } from "./types";
import { DEMO_COACH_ID, createBlankSession, normalizeSession } from "./sessions";

export const seedClients: Client[] = [
  {
    id: "sarah-johnson",
    name: "Sarah Johnson",
    initials: "SJ",
    organisation: "NHS Foundation Trust",
    role: "Former senior operational leader",
    email: "sarah.johnson@example.com",
    identityMode: "standard",
    displayLabel: "Sarah Johnson",
    confidentialReference: null,
    aiNameAllowed: false,
    status: "Active",
    nextSession: "Today, 10:00",
    currentFocus: "Rebuilding confidence and redefining professional identity after leaving senior leadership.",
    identitySummary: "Sarah is moving from defining herself through seniority and responsibility towards recognising the wider value of her experience, judgement and ability to support others.",
    coachInsight: "Sarah becomes more energised when discussing contribution, mentoring and meaningful influence than when discussing status or job title.",
    preparationStyleOverride: null,
    strengths: [
      { id: "s1", name: "Empathy", stage: "Established", evidence: "Consistently demonstrated through leadership and caring experiences." },
      { id: "s2", name: "Strategic thinking", stage: "Established", evidence: "Connects operational detail to wider organisational outcomes." },
      { id: "s3", name: "Curiosity", stage: "Developing", evidence: "Increasingly willing to explore unfamiliar career possibilities." },
      { id: "s4", name: "Resilience", stage: "Established", evidence: "Has rebuilt direction through significant professional change." }
    ],
    values: [
      { id: "v1", name: "Purpose", evidence: "Repeatedly linked to satisfaction and motivation." },
      { id: "v2", name: "Service", evidence: "Central to how Sarah describes meaningful work." },
      { id: "v3", name: "Integrity", evidence: "Influences decisions about roles and relationships." },
      { id: "v4", name: "Growth", evidence: "Emerging through exploration of coaching and mentoring." }
    ],
    themes: ["Confidence", "Purpose", "Identity", "Contribution", "Belonging"],
    goals: [
      "Build confidence beyond a previous job title",
      "Explore future roles that use leadership experience",
      "Develop a clearer professional narrative"
    ],
    actions: [
      { id: "a1", title: "Arrange one exploratory conversation with a professional contact", status: "In progress", due: "30 July" },
      { id: "a2", title: "Draft a two-paragraph professional identity statement", status: "Open", due: "2 August" },
      { id: "a3", title: "Record three examples of transferable value", status: "Complete" }
    ],
    quotes: [
      "I do not miss the job as much as I miss who I was in it.",
      "I am beginning to see that my experience still has value.",
      "I want the next chapter to feel purposeful, not simply impressive."
    ],
    sessions: [
      createBlankSession({
        id: "session-8",
        clientId: "sarah-johnson",
        coachId: DEMO_COACH_ID,
        sessionNumber: 8,
        date: "23 July 2026",
        time: "10:00",
        focus: "Confidence beyond role identity",
        preparation: "Explore what Sarah values about her contribution when status and title are removed.",
      }),
      normalizeSession(
        {
          id: "session-7",
          clientId: "sarah-johnson",
          coachId: DEMO_COACH_ID,
          sessionNumber: 7,
          date: "9 July 2026",
          time: "10:00",
          focus: "Transferable experience",
          preparation: "",
          notes: "Sarah described feeling more curious about the future and less focused on recreating her previous role.",
          reflection: "Continue to distinguish contribution from status.",
          summary: "Sarah identified mentoring, strategic judgement and calm leadership as transferable strengths.",
          emergingThemes: "Confidence\nContribution\nPurpose\nMentoring progress",
          strengthsObserved: "Mentoring\nStrategic judgement\nCalm leadership",
          valuesBecomingVisible: "Contribution\nPurpose",
          professionalIdentityDevelopment: "Sarah is beginning to describe her experience as transferable value rather than a closed chapter tied to a former title.",
          agreedActions: "Continue exploring mentoring and contribution-focused opportunities.",
          suggestedFocus: "How Sarah describes her professional value without relying on seniority.\nMentoring progress",
          coachReflection: "Distinguish contribution from status in the next conversation.",
          aiSummaryApproved: true,
          lastUpdated: "2026-07-09T10:45:00.000Z",
        },
        { clientId: "sarah-johnson", coachId: DEMO_COACH_ID, index: 1, total: 3 }
      ),
      normalizeSession(
        {
          id: "session-6",
          clientId: "sarah-johnson",
          coachId: DEMO_COACH_ID,
          sessionNumber: 6,
          date: "25 June 2026",
          time: "10:00",
          focus: "Confidence in meetings",
          preparation: "",
          notes: "Sarah spoke about confidence in meetings and wanting mentoring to feel purposeful.",
          reflection: "",
          summary: "Sarah explored confidence in meetings and linked mentoring with a clearer sense of contribution.",
          emergingThemes: "Confidence\nContribution\nPurpose",
          strengthsObserved: "Reflectiveness\nOpenness to mentoring",
          valuesBecomingVisible: "Purpose",
          professionalIdentityDevelopment: "Sarah linked confidence in meetings with contribution rather than title.",
          agreedActions: "Notice moments of confidence in the next meeting.",
          suggestedFocus: "Confidence in meetings",
          coachReflection: "Revisit confidence in meetings.",
          aiSummaryApproved: true,
          lastUpdated: "2026-06-25T10:45:00.000Z",
        },
        { clientId: "sarah-johnson", coachId: DEMO_COACH_ID, index: 2, total: 3 }
      ),
    ],
    journey: [
      { id: "j1", date: "2017", title: "Senior leadership", detail: "Built a strong professional identity around responsibility, expertise and organisational impact." },
      { id: "j2", date: "2022", title: "Burnout", detail: "Began questioning the cost of achievement and the sustainability of the role." },
      { id: "j3", date: "2024", title: "Career break", detail: "Stepped away from work and experienced a loss of professional certainty." },
      { id: "j4", date: "2025", title: "Caring responsibilities", detail: "Developed deeper empathy, patience and a wider understanding of purpose." },
      { id: "j5", date: "Now", title: "Exploring coaching", detail: "Beginning to see experience as transferable value rather than a closed chapter." }
    ]
  },
  {
    id: "david-smith",
    name: "David Smith",
    initials: "DS",
    organisation: "Independent Consultant",
    role: "Operations consultant",
    email: "david.smith@example.com",
    identityMode: "standard",
    displayLabel: "David Smith",
    confidentialReference: null,
    aiNameAllowed: false,
    status: "Active",
    nextSession: "Today, 14:00",
    currentFocus: "Finding renewed professional purpose after moving from employment into independent consultancy.",
    identitySummary: "David is shifting from relying on organisational authority towards trusting his own expertise, relationships and independent judgement.",
    coachInsight: "David speaks confidently about client outcomes but minimises the expertise that enables them.",
    preparationStyleOverride: null,
    strengths: [
      { id: "ds1", name: "Problem solving", stage: "Established", evidence: "Quickly identifies practical routes through complex operational issues." },
      { id: "ds2", name: "Reliability", stage: "Established", evidence: "Strong pattern of delivering on commitments." },
      { id: "ds3", name: "Self-advocacy", stage: "Developing", evidence: "Beginning to describe his value more directly." }
    ],
    values: [
      { id: "dv1", name: "Independence", evidence: "A major driver of the consultancy transition." },
      { id: "dv2", name: "Usefulness", evidence: "David wants his work to solve tangible problems." },
      { id: "dv3", name: "Trust", evidence: "Central to client relationships." }
    ],
    themes: ["Purpose", "Visibility", "Independence", "Confidence"],
    goals: ["Clarify consultancy positioning", "Become more comfortable communicating value"],
    actions: [
      { id: "da1", title: "Rewrite LinkedIn introduction", status: "Open", due: "28 July" },
      { id: "da2", title: "Request feedback from two recent clients", status: "In progress" }
    ],
    quotes: ["I know I can do the work. I am less comfortable telling people why they should choose me."],
    sessions: [
      createBlankSession({
        id: "d-session-4",
        clientId: "david-smith",
        coachId: DEMO_COACH_ID,
        sessionNumber: 4,
        date: "23 July 2026",
        time: "14:00",
        focus: "Communicating professional value",
        preparation: "Review language David uses when describing client impact.",
      }),
    ],
    journey: [
      { id: "dj1", date: "2023", title: "Left permanent employment", detail: "Moved away from a secure organisational identity." },
      { id: "dj2", date: "2025", title: "First major client", detail: "Evidence that independent expertise could create value." },
      { id: "dj3", date: "Now", title: "Defining consultancy identity", detail: "Building confidence in a clearer market position." }
    ]
  },
  {
    id: "emma-brown",
    name: "Emma Brown",
    initials: "EB",
    organisation: "Northbridge Group",
    role: "New executive director",
    email: "emma.brown@example.com",
    identityMode: "standard",
    displayLabel: "Emma Brown",
    confidentialReference: null,
    aiNameAllowed: false,
    status: "Active",
    nextSession: "29 July, 11:30",
    currentFocus: "Stepping into executive leadership with confidence while retaining an authentic leadership style.",
    identitySummary: "Emma is integrating a new executive role into an existing identity built around collaboration, credibility and professional expertise.",
    coachInsight: "Emma is strongest when she trusts her preparation; uncertainty rises when she compares herself with more established executives.",
    preparationStyleOverride: null,
    strengths: [
      { id: "es1", name: "Collaboration", stage: "Established", evidence: "Builds alignment across functions and perspectives." },
      { id: "es2", name: "Preparation", stage: "Established", evidence: "Creates clarity and confidence before high-stakes meetings." },
      { id: "es3", name: "Executive presence", stage: "Emerging", evidence: "Becoming more comfortable speaking early and setting direction." }
    ],
    values: [
      { id: "ev1", name: "Authenticity", evidence: "Emma does not want executive leadership to require an artificial persona." },
      { id: "ev2", name: "Fairness", evidence: "Strong influence on decisions and team relationships." },
      { id: "ev3", name: "Impact", evidence: "Motivated by visible organisational improvement." }
    ],
    themes: ["Executive identity", "Confidence", "Authenticity", "Influence"],
    goals: ["Speak with greater confidence in executive meetings", "Define an authentic executive leadership approach"],
    actions: [
      { id: "ea1", title: "Prepare one clear contribution before the next board meeting", status: "In progress", due: "27 July" },
      { id: "ea2", title: "Ask sponsor for feedback on executive presence", status: "Open" }
    ],
    quotes: ["I do not want to become a version of someone else simply because I am now an executive."],
    sessions: [
      createBlankSession({
        id: "e-session-3",
        clientId: "emma-brown",
        coachId: DEMO_COACH_ID,
        sessionNumber: 3,
        date: "29 July 2026",
        time: "11:30",
        focus: "Authentic executive presence",
        preparation: "Explore the difference between authority, confidence and performance.",
      }),
    ],
    journey: [
      { id: "ej1", date: "2024", title: "Promotion opportunity", detail: "Began considering a move into executive leadership." },
      { id: "ej2", date: "2026", title: "Executive appointment", detail: "Entered a role with greater visibility and organisational influence." },
      { id: "ej3", date: "Now", title: "Integrating executive identity", detail: "Developing confidence without losing authenticity." }
    ]
  }
];
