#!/usr/bin/env node
/**
 * Multi-client / multi-session reliability QA suite.
 *
 * Safety (all required):
 *   QA_ALLOW_DATA_MUTATION=true
 *   QA_APP_URL=http://127.0.0.1:3001
 *   QA_ENVIRONMENT=test
 *
 * Examples:
 *   QA_ALLOW_DATA_MUTATION=true QA_ENVIRONMENT=test QA_APP_URL=http://127.0.0.1:3001 \
 *     node --experimental-strip-types scripts/qa-multi-client-reliability.mjs --mode=smoke
 *
 *   QA_ALLOW_DATA_MUTATION=true QA_ENVIRONMENT=test QA_APP_URL=http://127.0.0.1:3001 \
 *     node --experimental-strip-types scripts/qa-multi-client-reliability.mjs --mode=scale --concurrency=3
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");

// Ensure TypeScript app helpers can be imported (relationship-scope, etc.).
if (!process.execArgv.some(arg => arg.includes("experimental-strip-types"))) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", __filename, ...process.argv.slice(2)],
    { stdio: "inherit", cwd: ROOT, env: process.env }
  );
  process.exit(result.status ?? 1);
}

const {
  parseArguments,
  createRunId,
  resolveScale,
  loadQaEnvironment,
  assertSafeEnvironment,
  normaliseSafeError,
  ensureDirExists,
} = await import("./qa/lib/qa-environment.mjs");
const { createTraceWriter } = await import("./qa/lib/qa-trace.mjs");
const { createAdminClient } = await import("./qa/lib/qa-supabase.mjs");
const { createFixtures } = await import("./qa/lib/qa-fixtures.mjs");
const { establishCoachCookies } = await import("./qa/lib/qa-auth.mjs");
const {
  verifyEnvironment,
  verifyPortfolioIsolation,
  verifySessionIntegrity,
  verifyPreparationIsolation,
  verifySummaryIsolation,
  verifyDevelopmentIsolation,
  verifyConcurrentGeneration,
  verifyIdempotency,
  verifyRoutesAndState,
  verifyDatabaseIntegrity,
  runBrowserChecks,
} = await import("./qa/lib/qa-phases.mjs");
const { cleanupFixtures, verifyCleanup } = await import("./qa/lib/qa-cleanup.mjs");
const { captureFailureScreenshot } = await import("./qa/lib/qa-browser.mjs");

async function createQaContext(options) {
  const env = loadQaEnvironment(options);
  const runId = createRunId();
  const scale = resolveScale(options);
  const runDir = resolve(ROOT, "tmp/multi-client-qa", runId);
  ensureDirExists(runDir);

  const context = {
    runId,
    appUrl: env.appUrl,
    mode: options.mode,
    options,
    env,
    scale,
    admin: null,
    coaches: [],
    clients: [],
    createdAuthUserIds: [],
    createdRelationshipIds: [],
    createdSessionIds: [],
    createdUpdateIds: [],
    createdMomentIds: [],
    diagnostics: {},
    trace: createTraceWriter(runDir),
  };

  return context;
}

async function captureFailure(context, error) {
  const normalised = normaliseSafeError(error);
  normalised.stage = error?.stage || normalised.stage;
  const shot = await captureFailureScreenshot(context, error);
  context.trace.writeTrace({
    operation: "failure",
    runId: context.runId,
    status: null,
    code: normalised.code,
    phase: normalised.stage,
    ok: false,
  });
  if (shot) {
    context.diagnostics = {
      ...(context.diagnostics || {}),
      failure: {
        code: normalised.code,
        url: shot.url,
        headings: shot.headings,
        screenshotPresent: Boolean(shot.screenshot),
      },
    };
  }
  return normalised;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const context = await createQaContext(options);

  try {
    assertSafeEnvironment(context);
    context.admin = createAdminClient();

    console.log(
      JSON.stringify({
        event: "MULTI_CLIENT_QA_START",
        runId: context.runId,
        mode: options.mode,
        coaches: context.scale.coachCount,
        clientsPerCoach: context.scale.clientsPerCoach,
        sessionsPerClient: context.scale.sessionsPerClient,
        concurrency: options.concurrency,
        skipAi: options.skipAi,
        appOrigin: new URL(context.appUrl).origin,
      })
    );

    const step = label => {
      console.log(JSON.stringify({ event: "MULTI_CLIENT_QA_PHASE", phase: label }));
    };

    step("environment");
    await verifyEnvironment(context);
    step("fixtures");
    const fixtureSummary = await createFixtures(context);
    context.trace.setPhase("fixtures", true, fixtureSummary);

    step("auth_cookies");
    for (const coach of context.coaches) {
      await establishCoachCookies(context, coach);
    }

    step("portfolio");
    await verifyPortfolioIsolation(context);
    step("session_integrity");
    await verifySessionIntegrity(context);

    if (!options.skipAi) {
      step("preparation");
      await verifyPreparationIsolation(context);
      step("summary");
      await verifySummaryIsolation(context);
      step("development");
      await verifyDevelopmentIsolation(context);
      step("concurrency");
      await verifyConcurrentGeneration(context);
    } else {
      context.trace.setPhase("preparation", true, { skipped: true });
      context.trace.setPhase("summary", true, { skipped: true });
      context.trace.setPhase("development", true, { skipped: true });
      context.trace.setPhase("concurrency", true, { skipped: true });
    }

    step("idempotency");
    await verifyIdempotency(context);
    step("routes");
    await verifyRoutesAndState(context);
    step("database");
    await verifyDatabaseIntegrity(context);
    step("browser");
    await runBrowserChecks(context);

    context.passed = true;
  } catch (error) {
    const normalised = await captureFailure(context, error);
    if (!context.trace.phaseResults.environment) {
      context.trace.setPhase("environment", false);
    }
    const failedStage = normalised.stage || error?.stage || "unknown";
    context.trace.setPhase(failedStage, false);
    context.failureError = normalised;
    context.passed = false;
    process.exitCode = 1;
  } finally {
    if (!options.keepData) {
      try {
        await cleanupFixtures(context);
        await verifyCleanup(context);
        context.trace.setPhase("cleanup", true, context.cleanupSummary || null);
      } catch (cleanupError) {
        context.trace.setPhase("cleanup", false, normaliseSafeError(cleanupError));
        process.exitCode = 1;
        context.passed = false;
        console.error(
          "MULTI_CLIENT_QA_CLEANUP_FAILED",
          normaliseSafeError(cleanupError)
        );
      }
    } else {
      context.trace.setPhase("cleanup", true, { kept: true });
      console.log(
        JSON.stringify({
          event: "MULTI_CLIENT_QA_DATA_KEPT",
          runId: context.runId,
          relationships: context.createdRelationshipIds.length,
          sessions: context.createdSessionIds.length,
        })
      );
    }

    const report = context.trace.writeReport(context, {
      passed: Boolean(context.passed) && !process.exitCode,
      error: context.failureError || null,
    });
    context.trace.printFinalSummary(report);

    if (process.exitCode) {
      process.exit(process.exitCode);
    }
  }
}

main().catch(error => {
  console.error("MULTI_CLIENT_QA_FATAL", normaliseSafeError(error));
  process.exit(1);
});
