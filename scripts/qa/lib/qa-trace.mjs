/**
 * Safe request tracing and final report writers.
 * Never writes narrative content, tokens, or secrets.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { summariseDurations } from "./qa-environment.mjs";

export function createTraceWriter(runDir) {
  mkdirSync(runDir, { recursive: true });
  mkdirSync(resolve(runDir, "screenshots"), { recursive: true });
  const tracePath = resolve(runDir, "trace.jsonl");
  const timings = {
    portfolio: [],
    relationshipLoad: [],
    sessionList: [],
    preparation: [],
    summary: [],
    development: [],
    profileLoad: [],
    pagination: [],
    search: [],
  };

  const counters = {
    crossClientReferences: 0,
    wrongSessionOperations: 0,
    duplicateWrites: 0,
    failedValidOperations: 0,
    isolationChecks: 0,
    isolationFailures: 0,
    aiOperations: 0,
    concurrentRounds: 0,
  };

  const phaseResults = {};

  function recordTiming(bucket, durationMs) {
    if (timings[bucket] && Number.isFinite(durationMs)) {
      timings[bucket].push(durationMs);
    }
  }

  function writeTrace(entry) {
    const safe = {
      operation: entry.operation,
      runId: entry.runId,
      coachId: entry.coachId || null,
      clientId: entry.clientId || null,
      relationshipId: entry.relationshipId || null,
      sessionId: entry.sessionId || null,
      requestId: entry.requestId || null,
      responseId: entry.responseId || null,
      status: entry.status ?? null,
      code: entry.code || null,
      durationMs: entry.durationMs ?? null,
      attempt: entry.attempt ?? 1,
      phase: entry.phase || null,
      ok: entry.ok ?? null,
    };
    appendFileSync(tracePath, `${JSON.stringify(safe)}\n`, "utf8");
    return safe;
  }

  function setPhase(name, result, detail = null) {
    phaseResults[name] = {
      result: result ? "PASS" : "FAIL",
      detail,
    };
  }

  function writeReport(context, outcome) {
    const report = {
      runId: context.runId,
      mode: context.options.mode,
      passed: Boolean(outcome.passed),
      coaches: context.coaches.length,
      clients: context.clients.length,
      sessions: context.createdSessionIds.length,
      aiOperations: counters.aiOperations,
      concurrentRounds: counters.concurrentRounds,
      phases: phaseResults,
      counters,
      performance: Object.fromEntries(
        Object.entries(timings).map(([key, values]) => [
          key,
          summariseDurations(values),
        ])
      ),
      error: outcome.error || null,
      keepData: Boolean(context.options.keepData),
      scale: context.scale,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(
      resolve(runDir, "report.json"),
      JSON.stringify(report, null, 2),
      "utf8"
    );
    return report;
  }

  function printFinalSummary(report) {
    const line = (name, key) => {
      const phase = report.phases[key];
      const result = phase?.result || (report.passed ? "PASS" : "SKIP");
      return `${name.padEnd(34)} ${result}`;
    };

    console.log("");
    console.log("MULTI-CLIENT RELIABILITY QA");
    console.log("");
    console.log(`Run ID: ${report.runId}`);
    console.log(`Mode: ${report.mode}`);
    console.log(`Coaches: ${report.coaches}`);
    console.log(`Clients: ${report.clients}`);
    console.log(`Sessions: ${report.sessions}`);
    console.log(`AI operations: ${report.aiOperations}`);
    console.log(`Concurrent rounds: ${report.concurrentRounds}`);
    console.log("");
    console.log("Check                              Result");
    console.log(line("Environment", "environment"));
    console.log(line("Fixture integrity", "fixtures"));
    console.log(line("Coach isolation", "coachIsolation"));
    console.log(line("Relationship isolation", "relationshipIsolation"));
    console.log(line("Session identity", "sessionIdentity"));
    console.log(line("Preparation", "preparation"));
    console.log(line("Summary & Insights", "summary"));
    console.log(line("Development", "development"));
    console.log(line("Concurrency", "concurrency"));
    console.log(line("Idempotency", "idempotency"));
    console.log(line("Browser flow", "browser"));
    console.log(line("Cleanup", "cleanup"));
    console.log("");
    console.log(`Cross-client references: ${report.counters.crossClientReferences}`);
    console.log(`Wrong-session operations: ${report.counters.wrongSessionOperations}`);
    console.log(`Duplicate writes: ${report.counters.duplicateWrites}`);
    console.log(`Failed valid operations: ${report.counters.failedValidOperations}`);
    console.log("");
    console.log(`Overall: ${report.passed ? "PASS" : "FAIL"}`);
    if (!report.passed && report.error) {
      console.log(`Stage: ${report.error.stage || "unknown"}`);
      console.log(`Code: ${report.error.code}`);
    }
    console.log("");
  }

  return {
    runDir,
    tracePath,
    timings,
    counters,
    phaseResults,
    recordTiming,
    writeTrace,
    setPhase,
    writeReport,
    printFinalSummary,
  };
}
