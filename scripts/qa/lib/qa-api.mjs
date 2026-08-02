/**
 * Authenticated API helpers using existing application routes only.
 */
import { ensureCoachCookies } from "./qa-auth.mjs";

function safeResponseCode(payload, status) {
  if (payload && typeof payload === "object") {
    if (typeof payload.code === "string") return payload.code;
    if (typeof payload.error === "string") {
      return payload.error.slice(0, 80);
    }
  }
  return `HTTP_${status}`;
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: true, length: text.length };
  }
}

export async function apiRequest(context, coach, input) {
  const cookieHeader = await ensureCoachCookies(context, coach);
  const maxAttempts = input.retries ?? (input.method === "GET" || !input.method ? 3 : 1);
  let last = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    const requestId = crypto.randomUUID();

    let response;
    try {
      response = await fetch(`${context.appUrl}${input.path}`, {
        method: input.method || "GET",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          cookie: cookieHeader,
          "x-qa-run-id": context.runId,
          "x-qa-request-id": requestId,
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        signal: AbortSignal.timeout(
          input.timeoutMs || context.env.thresholds.aiTimeout
        ),
      });
    } catch (error) {
      last = {
        ok: false,
        status: 0,
        code: "QA_FETCH_FAILED",
        payload: null,
        durationMs: Date.now() - started,
        requestId,
        responseId: null,
        attempt,
      };
      context.trace.writeTrace({
        operation: input.operation,
        runId: context.runId,
        coachId: coach.coachId,
        clientId: input.clientId || null,
        relationshipId: input.relationshipId || input.clientId || null,
        sessionId: input.sessionId || null,
        requestId,
        status: 0,
        code: "QA_FETCH_FAILED",
        durationMs: last.durationMs,
        attempt,
        phase: input.phase || null,
        ok: false,
      });
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 400 * attempt));
        continue;
      }
      return last;
    }

    const durationMs = Date.now() - started;
    const payload = await readJsonSafe(response);
    const code = safeResponseCode(payload, response.status);
    const responseId =
      (payload &&
        typeof payload === "object" &&
        (payload.responseId || payload.id)) ||
      null;

    const trace = context.trace.writeTrace({
      operation: input.operation,
      runId: context.runId,
      coachId: coach.coachId,
      clientId: input.clientId || null,
      relationshipId: input.relationshipId || input.clientId || null,
      sessionId: input.sessionId || null,
      requestId,
      responseId,
      status: response.status,
      code,
      durationMs,
      attempt,
      phase: input.phase || null,
      ok: response.ok,
    });

    last = {
      ok: response.ok,
      status: response.status,
      code,
      payload,
      durationMs,
      requestId,
      responseId,
      trace,
      attempt,
    };

    // Retry transient Next/dev 500s on safe reads (and optionally AI posts).
    const retryable =
      response.status >= 500 ||
      response.status === 429 ||
      response.status === 0;
    if (!response.ok && retryable && attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 500 * attempt));
      continue;
    }

    return last;
  }

  return last;
}

export async function listClients(context, coach, phase = "portfolio") {
  const result = await apiRequest(context, coach, {
    operation: "list_clients",
    method: "GET",
    path: "/api/clients",
    phase,
    timeoutMs: context.env.thresholds.portfolioFirstPage + 5000,
  });
  context.trace.recordTiming("portfolio", result.durationMs);
  return result;
}

export async function listSessions(context, coach, clientId, phase = "sessionList") {
  const result = await apiRequest(context, coach, {
    operation: "list_sessions",
    method: "GET",
    path: `/api/sessions?clientId=${encodeURIComponent(clientId)}`,
    clientId,
    relationshipId: clientId,
    phase,
    timeoutMs: context.env.thresholds.relationshipLoad + 5000,
  });
  context.trace.recordTiming("sessionList", result.durationMs);
  return result;
}

export async function putSession(context, coach, sessionPayload, phase = "save_session") {
  return apiRequest(context, coach, {
    operation: "put_session",
    method: "PUT",
    path: "/api/sessions",
    body: { session: sessionPayload },
    clientId: sessionPayload.clientId,
    relationshipId: sessionPayload.clientId,
    sessionId: sessionPayload.id,
    phase,
  });
}

export async function postSession(context, coach, sessionPayload, phase = "create_session") {
  return apiRequest(context, coach, {
    operation: "post_session",
    method: "POST",
    path: "/api/sessions",
    body: { session: sessionPayload },
    clientId: sessionPayload.clientId,
    relationshipId: sessionPayload.clientId,
    sessionId: sessionPayload.id,
    phase,
  });
}

export async function generatePreparation(
  context,
  coach,
  { clientId, sessionId, style = "guided" },
  phase = "preparation"
) {
  const result = await apiRequest(context, coach, {
    operation: "preparation_generate",
    method: "POST",
    path: "/api/preparation/generate",
    body: { clientId, sessionId, style },
    clientId,
    relationshipId: clientId,
    sessionId,
    phase,
    retries: 2,
  });
  context.trace.counters.aiOperations += 1;
  context.trace.recordTiming("preparation", result.durationMs);
  return result;
}

export async function generateDraftSummary(
  context,
  coach,
  { notes, focus, clientName, clientId, sessionId },
  phase = "summary"
) {
  const result = await apiRequest(context, coach, {
    operation: "draft_summary",
    method: "POST",
    path: "/api/draft-summary",
    body: { notes, focus, clientName },
    clientId,
    relationshipId: clientId,
    sessionId,
    phase,
    retries: 2,
  });
  context.trace.counters.aiOperations += 1;
  context.trace.recordTiming("summary", result.durationMs);
  return result;
}

export async function generateDevelopmentUpdate(
  context,
  coach,
  { clientId, sessionId },
  phase = "development"
) {
  const result = await apiRequest(context, coach, {
    operation: "development_generate",
    method: "POST",
    path: "/api/development-updates/generate",
    body: { clientId, sessionId },
    clientId,
    relationshipId: clientId,
    sessionId,
    phase,
    retries: 2,
  });
  context.trace.counters.aiOperations += 1;
  context.trace.recordTiming("development", result.durationMs);
  if (result.payload?.update?.id) {
    context.createdUpdateIds.push(result.payload.update.id);
  }
  return result;
}

export async function applyDevelopmentUpdate(context, coach, updateId, meta = {}) {
  return apiRequest(context, coach, {
    operation: "development_apply",
    method: "POST",
    path: `/api/development-updates/${updateId}/apply`,
    clientId: meta.clientId || null,
    relationshipId: meta.clientId || null,
    sessionId: meta.sessionId || null,
    phase: "development_apply",
  });
}

export async function getDevelopmentForSession(context, coach, sessionId, clientId) {
  return apiRequest(context, coach, {
    operation: "development_by_session",
    method: "GET",
    path: `/api/development-updates/session/${sessionId}`,
    clientId,
    relationshipId: clientId,
    sessionId,
    phase: "development_read",
  });
}

export async function getDevelopmentProfile(context, coach, clientId) {
  const result = await apiRequest(context, coach, {
    operation: "development_profile",
    method: "GET",
    path: `/api/development-profiles/${clientId}`,
    clientId,
    relationshipId: clientId,
    phase: "profile_load",
    timeoutMs: context.env.thresholds.relationshipLoad + 5000,
  });
  context.trace.recordTiming("profileLoad", result.durationMs);
  return result;
}

export async function probeRoutes(context) {
  const paths = [
    "/",
    "/auth/sign-in",
    "/api/clients",
    "/_next/static/chunks/webpack.js",
  ];
  const results = [];
  for (const path of paths) {
    const started = Date.now();
    const response = await fetch(`${context.appUrl}${path}`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    results.push({
      path,
      status: response.status,
      durationMs: Date.now() - started,
    });
  }
  return results;
}
