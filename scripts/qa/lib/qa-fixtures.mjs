/**
 * Multi-client fixture builders with distinct evidence themes and session states.
 * Fingerprints live only in supporting_context (useForAiPreparation: false).
 */

export const SMOKE_CLIENT_BLUEPRINTS = [
  {
    displayName: "Sarah Thompson",
    fingerprint: "QA-SARAH-DELEGATION",
    organisation: "Meridian Health Group",
    role: "Director of Operations",
    themes: ["delegation", "supervisor confidence", "strategic leadership"],
    currentFocus: "Build supervisor confidence while delegating strategic decisions.",
    notes: {
      1: "Sarah explored when she takes decisions back from supervisors under pressure. Delegation and strategic leadership were central.",
      2: "Reviewed a live case where Sarah left a decision with her deputy. Supervisor confidence improved; she noted the urge to intervene.",
      3: "Sarah described a board prep conversation. Focus remained on strategic leadership without reclaiming operational ownership.",
    },
    summaries: {
      1: "Sarah strengthened delegation boundaries and practised leaving decisions with supervisors.",
      2: "Sarah sustained delegation under pressure and noticed increased supervisor confidence.",
    },
  },
  {
    displayName: "Daniel Reed",
    fingerprint: "QA-DREED-ACCOUNTABILITY",
    organisation: "Northbridge NHS Trust",
    role: "Operations Director",
    themes: ["accountability", "management ownership", "operational control"],
    currentFocus: "Hold managers accountable without reclaiming operational control.",
    notes: {
      1: "Daniel Reed examined where accountability slips when delivery is at risk. Management ownership was the through-line.",
      2: "Daniel Reed practised naming ownership gaps early. Operational control remained with managers for day-to-day decisions.",
      3: "Daniel Reed reviewed a missed handoff. Accountability language stayed specific to his management team.",
    },
    summaries: {
      1: "Daniel Reed clarified accountability expectations and reduced reflexive operational takeover.",
      2: "Daniel Reed reinforced management ownership while monitoring delivery risk.",
    },
  },
  {
    displayName: "Daniel Roberts",
    fingerprint: "QA-DROBERTS-CONVERSATIONS",
    organisation: "Horizon Facilities Group",
    role: "Head of Service Delivery",
    themes: ["difficult conversations", "conflict avoidance", "leadership confidence"],
    currentFocus: "Hold difficult conversations earlier without avoiding conflict.",
    notes: {
      1: "Daniel Roberts explored conflict avoidance in a contractor escalation. Leadership confidence grew when he stayed in the conversation.",
      2: "Daniel Roberts prepared for a difficult conversation with a peer. He practised naming impact without softening the point away.",
      3: "Daniel Roberts reflected on a tense stakeholder meeting. Conflict avoidance was visible but interrupted more quickly.",
    },
    summaries: {
      1: "Daniel Roberts practised earlier difficult conversations and reduced conflict avoidance.",
      2: "Daniel Roberts built leadership confidence while staying present in challenging dialogue.",
    },
  },
];

function scaleBlueprint(index) {
  const base = SMOKE_CLIENT_BLUEPRINTS[index % SMOKE_CLIENT_BLUEPRINTS.length];
  const surnamePool = [
    "Thompson",
    "Reed",
    "Roberts",
    "Reynolds",
    "Reid",
    "Robertson",
    "Thorne",
    "Read",
  ];
  const firstPool = ["Sarah", "Daniel", "Sam", "Alex", "Jordan", "Taylor"];
  const first = firstPool[index % firstPool.length];
  const surname = surnamePool[index % surnamePool.length];
  const displayName = `${first} ${surname}`;
  const fingerprint = `QA-SCALE-${String(index + 1).padStart(3, "0")}-${base.fingerprint.split("-").slice(-1)[0]}`;
  return {
    ...base,
    displayName,
    fingerprint,
    organisation: `${base.organisation} Unit ${index + 1}`,
    role: base.role,
    currentFocus: `${base.currentFocus} [scale-${index + 1}]`,
    notes: {
      1: `${displayName}: ${base.notes[1]}`,
      2: `${displayName}: ${base.notes[2]}`,
      3: `${displayName}: ${base.notes[3]}`,
    },
    summaries: {
      1: `${displayName}: ${base.summaries[1]}`,
      2: `${displayName}: ${base.summaries[2]}`,
    },
  };
}

function supportingContextMarker(runId, fingerprint) {
  return [
    {
      id: crypto.randomUUID(),
      title: "__QA_FIXTURE_MARKER__",
      sourceType: "other",
      sourceDate: "2026-01-01",
      summary: `runId=${runId}; fingerprint=${fingerprint}`,
      documentUrl: null,
      documentName: null,
      useForAiPreparation: false,
    },
  ];
}

function sessionDate(offsetDays) {
  const d = new Date("2026-06-01T10:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Session plan for a client:
 * 1 completed + approved + development applied
 * 2 completed + approved/skipped + development applied/no-change
 * 3 completed + notes, summary not generated
 * 4 planned, preparation not generated
 * 5/6 (scale) mixed
 */
function buildSessionSpecs(blueprint, sessionsPerClient, clientIndex) {
  const specs = [];

  specs.push({
    sessionNumber: 1,
    expectedStatus: "completed",
    status: "completed",
    notes: blueprint.notes[1],
    summary: blueprint.summaries[1],
    summary_status: "approved",
    ai_summary_approved: true,
    notes_saved_at: "2026-06-02T12:00:00.000Z",
    completed_at: "2026-06-02T12:30:00.000Z",
    development: "applied",
    focus: blueprint.themes[0],
  });

  const session2SkipSummary = clientIndex % 2 === 1;
  specs.push({
    sessionNumber: 2,
    expectedStatus: "completed",
    status: "completed",
    notes: blueprint.notes[2],
    summary: session2SkipSummary ? "" : blueprint.summaries[2],
    summary_status: session2SkipSummary ? "not_generated" : "approved",
    ai_summary_approved: !session2SkipSummary,
    notes_saved_at: "2026-06-16T12:00:00.000Z",
    completed_at: "2026-06-16T12:30:00.000Z",
    development: session2SkipSummary ? "no_change_fixture" : "applied",
    focus: blueprint.themes[1],
  });

  specs.push({
    sessionNumber: 3,
    expectedStatus: "completed_notes_pending_summary",
    status: "awaiting_completion",
    notes: blueprint.notes[3],
    summary: "",
    summary_status: "not_generated",
    ai_summary_approved: false,
    notes_saved_at: "2026-06-30T12:00:00.000Z",
    completed_at: null,
    session_started_at: "2026-06-30T10:00:00.000Z",
    development: "none",
    focus: blueprint.themes[2],
  });

  specs.push({
    sessionNumber: 4,
    expectedStatus: "planned",
    status: "planned",
    notes: "",
    summary: "",
    summary_status: "not_generated",
    ai_summary_approved: false,
    notes_saved_at: null,
    completed_at: null,
    development: "none",
    focus: `Next focus: ${blueprint.themes[0]}`,
  });

  if (sessionsPerClient >= 5) {
    specs.push({
      sessionNumber: 5,
      expectedStatus: "prepared",
      status: "prepared",
      notes: "",
      summary: "",
      summary_status: "not_generated",
      ai_summary_approved: false,
      prep_purpose: "Review progress on the primary theme.",
      prep_topics: blueprint.themes.join("; "),
      prep_questions: "What ownership still sits with you?",
      development: "none",
      focus: blueprint.themes[0],
    });
  }

  if (sessionsPerClient >= 6) {
    const variant = clientIndex % 3;
    if (variant === 0) {
      specs.push({
        sessionNumber: 6,
        expectedStatus: "in_progress",
        status: "in_progress",
        notes: "Partial notes only.",
        summary: "",
        summary_status: "not_generated",
        ai_summary_approved: false,
        session_started_at: "2026-07-20T10:00:00.000Z",
        development: "none",
        focus: blueprint.themes[1],
      });
    } else if (variant === 1) {
      specs.push({
        sessionNumber: 6,
        expectedStatus: "awaiting_completion_incomplete_notes",
        status: "awaiting_completion",
        notes: "",
        summary: "",
        summary_status: "not_generated",
        ai_summary_approved: false,
        session_started_at: "2026-07-21T10:00:00.000Z",
        development: "none",
        focus: blueprint.themes[1],
      });
    } else {
      specs.push({
        sessionNumber: 6,
        expectedStatus: "completed_skipped_intelligence",
        status: "completed",
        notes: `${blueprint.displayName} completed with skipped intelligence.`,
        summary: "",
        summary_status: "not_generated",
        ai_summary_approved: false,
        notes_saved_at: "2026-07-22T12:00:00.000Z",
        completed_at: "2026-07-22T12:30:00.000Z",
        development: "none",
        focus: blueprint.themes[2],
      });
    }
  }

  return specs.slice(0, sessionsPerClient);
}

async function insertDevelopmentFixture(admin, context, clientFixture, sessionId, mode) {
  if (mode === "none") return null;

  const now = new Date().toISOString();
  const meaningful = mode === "applied";
  const payload = {
    client_id: clientFixture.clientId,
    session_id: sessionId,
    coach_id: clientFixture.coachId,
    status: meaningful ? "applied" : "ready_for_review",
    conversation_summary: meaningful
      ? `Fixture update for ${clientFixture.fingerprint}`
      : "No meaningful profile change in this fixture session.",
    proposed_changes: meaningful
      ? {
          emergingThemes: {
            add: [
              {
                value: clientFixture.themes[0],
                status: "emerging",
                reason: "Repeated across approved evidence",
              },
            ],
            update: [],
            remove: [],
          },
        }
      : {},
    evidence_summary: meaningful
      ? [
          {
            changeKey: "emergingThemes.add.0",
            evidenceText: "Theme visible in approved summary.",
            sourceExcerpt: "approved evidence",
            sessionId,
          },
        ]
      : [],
    has_meaningful_changes: meaningful,
    generated_at: now,
    reviewed_at: meaningful ? now : null,
    applied_at: meaningful ? now : null,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("development_updates")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) {
    const err = new Error("QA_FIXTURE_DEV_UPDATE_FAILED");
    err.code = "QA_FIXTURE_DEV_UPDATE_FAILED";
    err.safeDetails = { sessionId, mode };
    throw err;
  }
  context.createdUpdateIds.push(data.id);

  if (meaningful) {
    await admin.from("development_profiles").upsert(
      {
        client_id: clientFixture.clientId,
        coach_id: clientFixture.coachId,
        current_focus: clientFixture.currentFocus,
        emerging_themes: [
          {
            id: crypto.randomUUID(),
            value: clientFixture.themes[0],
            status: "emerging",
            reason: "fixture",
          },
        ],
        updated_at: now,
      },
      { onConflict: "client_id" }
    );
  }

  return data.id;
}

export async function createClientFixture(context, coach, blueprint, clientIndex) {
  const admin = context.admin;
  const runId = context.runId;

  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      coach_id: coach.coachId,
      name: blueprint.displayName,
      organisation: blueprint.organisation,
      role: blueprint.role,
      status: "Active",
      current_focus: blueprint.currentFocus,
      identity_summary: `${blueprint.displayName} is developing ${blueprint.themes.join(", ")}.`,
      coach_insight: `Stay with ${blueprint.themes[0]} evidence for this relationship.`,
      email: `qa-${runId}-${clientIndex}@identity.test`,
      supporting_context: supportingContextMarker(runId, blueprint.fingerprint),
    })
    .select("id,name,coach_id,organisation")
    .single();

  if (clientError || !client) {
    const err = new Error("QA_FIXTURE_CLIENT_FAILED");
    err.code = "QA_FIXTURE_CLIENT_FAILED";
    err.safeDetails = { clientIndex, coachId: coach.coachId };
    throw err;
  }

  context.createdRelationshipIds.push(client.id);

  const fixture = {
    coachId: coach.coachId,
    clientId: client.id,
    relationshipId: client.id,
    displayName: blueprint.displayName,
    fingerprint: blueprint.fingerprint,
    organisation: blueprint.organisation,
    role: blueprint.role,
    themes: blueprint.themes,
    currentFocus: blueprint.currentFocus,
    sessions: [],
  };

  const specs = buildSessionSpecs(
    blueprint,
    context.scale.sessionsPerClient,
    clientIndex
  );

  for (const spec of specs) {
    const row = {
      client_id: client.id,
      coach_id: coach.coachId,
      session_number: spec.sessionNumber,
      title: `Session ${spec.sessionNumber} — ${blueprint.themes[0]}`,
      session_date: sessionDate(spec.sessionNumber * 14),
      status: spec.status,
      focus: spec.focus,
      notes: spec.notes || "",
      summary: spec.summary || "",
      summary_status: spec.summary_status,
      ai_summary_approved: Boolean(spec.ai_summary_approved),
      notes_saved_at: spec.notes_saved_at || null,
      completed_at: spec.completed_at || null,
      session_started_at: spec.session_started_at || null,
      reflect_what_surprised: spec.notes
        ? `Key shift for ${blueprint.displayName}.`
        : "",
      commitments: spec.sessionNumber <= 2 ? `Practice ${blueprint.themes[0]}.` : "",
      prep_purpose: spec.prep_purpose || null,
      prep_topics: spec.prep_topics || null,
      prep_questions: spec.prep_questions || null,
      prep_private_notes: `runId=${runId}; fingerprint=${blueprint.fingerprint}`,
    };

    const { data: session, error: sessionError } = await admin
      .from("sessions")
      .insert(row)
      .select("id,session_number,status,client_id,coach_id")
      .single();

    if (sessionError || !session) {
      const err = new Error("QA_FIXTURE_SESSION_FAILED");
      err.code = "QA_FIXTURE_SESSION_FAILED";
      err.safeDetails = {
        clientId: client.id,
        sessionNumber: spec.sessionNumber,
      };
      throw err;
    }

    context.createdSessionIds.push(session.id);

    if (spec.development && spec.development !== "none") {
      await insertDevelopmentFixture(
        admin,
        context,
        fixture,
        session.id,
        spec.development === "applied" ? "applied" : "no_change_fixture"
      );
    }

    fixture.sessions.push({
      id: session.id,
      sessionNumber: spec.sessionNumber,
      expectedStatus: spec.expectedStatus,
      status: session.status,
      development: spec.development,
    });
  }

  // Immediate validation
  if (fixture.sessions.length !== specs.length) {
    const err = new Error("QA_FIXTURE_SESSION_COUNT");
    err.code = "QA_FIXTURE_SESSION_COUNT";
    throw err;
  }

  context.clients.push(fixture);
  return fixture;
}

export async function createFixtures(context) {
  const { createCoachAccount } = await import("./qa-auth.mjs");
  const blueprints =
    context.options.mode === "smoke"
      ? SMOKE_CLIENT_BLUEPRINTS.slice(0, context.scale.clientsPerCoach)
      : Array.from({ length: context.scale.clientsPerCoach }, (_, i) =>
          scaleBlueprint(i)
        );

  for (let c = 0; c < context.scale.coachCount; c += 1) {
    const coach = await createCoachAccount(context, c + 1);
    for (let i = 0; i < blueprints.length; i += 1) {
      // Smoke reuses named blueprints; scale regenerates per coach with offset
      const blueprint =
        context.options.mode === "smoke"
          ? blueprints[i]
          : scaleBlueprint(c * context.scale.clientsPerCoach + i);
      await createClientFixture(context, coach, blueprint, i);
    }
  }

  return {
    coaches: context.coaches.length,
    clients: context.clients.length,
    sessions: context.createdSessionIds.length,
  };
}

export function clientsForCoach(context, coachId) {
  return context.clients.filter(c => c.coachId === coachId);
}

export function sessionByNumber(clientFixture, sessionNumber) {
  const session = clientFixture.sessions.find(s => s.sessionNumber === sessionNumber);
  if (!session) {
    const error = new Error("QA_SESSION_NOT_IN_FIXTURE");
    error.code = "QA_SESSION_NOT_IN_FIXTURE";
    error.safeDetails = {
      clientId: clientFixture.clientId,
      sessionNumber,
    };
    throw error;
  }
  return session;
}

export function aiEligibleClients(context, coachId) {
  const owned = clientsForCoach(context, coachId);
  return owned.slice(0, context.scale.aiSubsetPerCoach);
}
