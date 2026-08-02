/**
 * Environment safety gates and CLI parsing for multi-client reliability QA.
 * Never logs secret values.
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { loadEnvLocal, projectRefFromEnv } from "../../load-env-local.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const DEFAULT_THRESHOLDS_MS = {
  portfolioFirstPage: 2000,
  relationshipLoad: 2000,
  nonAiSessionModule: 2000,
  aiTimeout: 180_000,
};

export function getProjectRoot() {
  return ROOT;
}

export function parseArguments(argv) {
  const options = {
    mode: "smoke",
    appUrl: "",
    concurrency: 3,
    keepData: false,
    skipAi: false,
    clientCount: null,
    sessionCount: null,
    coachCount: null,
  };

  for (const arg of argv) {
    if (arg === "--keep-data") {
      options.keepData = true;
      continue;
    }
    if (arg === "--skip-ai") {
      options.skipAi = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const [, key, value] = match;
    switch (key) {
      case "mode":
        if (value !== "smoke" && value !== "scale") {
          throw new Error(`Invalid --mode=${value}. Use smoke|scale.`);
        }
        options.mode = value;
        break;
      case "app-url":
        options.appUrl = value.replace(/\/$/, "");
        break;
      case "concurrency":
        options.concurrency = Math.max(1, Number.parseInt(value, 10) || 1);
        break;
      case "client-count":
        options.clientCount = Math.max(1, Number.parseInt(value, 10) || 1);
        break;
      case "session-count":
        options.sessionCount = Math.max(1, Number.parseInt(value, 10) || 1);
        break;
      case "coach-count":
        options.coachCount = Math.max(1, Number.parseInt(value, 10) || 1);
        break;
      default:
        throw new Error(`Unknown argument: --${key}`);
    }
  }

  return options;
}

export function createRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `multi-client-qa-${stamp}-${random}`;
}

export function resolveScale(options) {
  if (options.mode === "scale") {
    return {
      coachCount: options.coachCount ?? 3,
      clientsPerCoach: options.clientCount ?? 20,
      sessionsPerClient: options.sessionCount ?? 6,
      concurrentRounds: 20,
      aiSubsetPerCoach: 3,
    };
  }
  return {
    coachCount: options.coachCount ?? 1,
    clientsPerCoach: options.clientCount ?? 3,
    sessionsPerClient: options.sessionCount ?? 4,
    concurrentRounds: 10,
    aiSubsetPerCoach: 3,
  };
}

function hostnameLooksLocal(hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "::1"
  );
}

function appUrlLooksProduction(appUrl) {
  let parsed;
  try {
    parsed = new URL(appUrl);
  } catch {
    return true;
  }
  if (!hostnameLooksLocal(parsed.hostname)) return true;
  if (parsed.protocol === "https:" && !hostnameLooksLocal(parsed.hostname)) {
    return true;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host.includes("production") ||
    host.includes("prod.") ||
    host.endsWith(".vercel.app") ||
    host.includes("identity.app")
  ) {
    return true;
  }
  return false;
}

function supabaseLooksProduction(projectRef) {
  if (process.env.QA_SUPABASE_IS_PRODUCTION === "true") return true;
  const denylist = String(process.env.QA_PRODUCTION_SUPABASE_REFS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (denylist.includes(projectRef)) return true;
  if (/prod|production/i.test(projectRef)) return true;
  return false;
}

/**
 * Count distinct `next dev` parent processes whose cwd is this project.
 * Worker/child processes are ignored — only competing app servers matter.
 */
export function countNextServersUsingProjectNext(projectRoot = ROOT) {
  try {
    const lines = execSync(`pgrep -fl "next dev" || true`, {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    let using = 0;
    for (const line of lines) {
      const pid = line.split(/\s+/)[0];
      if (!pid || !/^\d+$/.test(pid)) continue;
      try {
        const cwd = execSync(
          `lsof -a -p ${pid} -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'`,
          { encoding: "utf8" }
        ).trim();
        if (cwd === projectRoot) {
          using += 1;
          continue;
        }
        // Fallback: process has this project's .next open and command is next dev
        const touchesNext = execSync(
          `lsof -p ${pid} 2>/dev/null | grep -F ${JSON.stringify(projectRoot + "/.next")} | head -1 || true`,
          { encoding: "utf8" }
        ).trim();
        if (touchesNext && /next dev/.test(line)) {
          using += 1;
        }
      } catch {
        // ignore per-pid failures
      }
    }
    return using;
  } catch {
    return 0;
  }
}

export function loadQaEnvironment(cliOptions) {
  loadEnvLocal(ROOT);

  const appUrl = (
    cliOptions.appUrl ||
    process.env.QA_APP_URL ||
    process.env.APP_URL ||
    ""
  ).replace(/\/$/, "");

  return {
    root: ROOT,
    appUrl,
    qaAllowMutation: process.env.QA_ALLOW_DATA_MUTATION === "true",
    qaEnvironment: process.env.QA_ENVIRONMENT || "",
    qaAllowKeepData: process.env.QA_ALLOW_KEEP_TEST_DATA === "true",
    nodeEnv: process.env.NODE_ENV || "",
    supabaseUrlPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKeyPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRolePresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    openaiPresent: Boolean(process.env.OPENAI_API_KEY),
    projectRef: projectRefFromEnv(),
    thresholds: {
      portfolioFirstPage: Number(
        process.env.QA_THRESHOLD_PORTFOLIO_MS || DEFAULT_THRESHOLDS_MS.portfolioFirstPage
      ),
      relationshipLoad: Number(
        process.env.QA_THRESHOLD_RELATIONSHIP_MS || DEFAULT_THRESHOLDS_MS.relationshipLoad
      ),
      nonAiSessionModule: Number(
        process.env.QA_THRESHOLD_SESSION_MODULE_MS ||
          DEFAULT_THRESHOLDS_MS.nonAiSessionModule
      ),
      aiTimeout: Number(
        process.env.QA_THRESHOLD_AI_TIMEOUT_MS || DEFAULT_THRESHOLDS_MS.aiTimeout
      ),
    },
  };
}

export function assertSafeEnvironment(context) {
  const env = context.env;
  const failures = [];

  if (!env.qaAllowMutation) {
    failures.push("QA_ALLOW_DATA_MUTATION must be true");
  }
  if (!env.appUrl) {
    failures.push("QA_APP_URL (or --app-url) is required");
  }
  if (env.qaEnvironment !== "test") {
    failures.push("QA_ENVIRONMENT must be test");
  }
  if (env.nodeEnv === "production") {
    failures.push("NODE_ENV must not be production");
  }
  if (env.appUrl && appUrlLooksProduction(env.appUrl)) {
    failures.push("App URL resembles production and is refused");
  }
  if (!env.serviceRolePresent) {
    failures.push("SUPABASE_SERVICE_ROLE_KEY is absent");
  }
  if (!env.supabaseUrlPresent || !env.anonKeyPresent) {
    failures.push("Supabase URL/anon key missing");
  }
  if (supabaseLooksProduction(env.projectRef)) {
    failures.push("Supabase project identified as production");
  }
  if (context.options.keepData && !env.qaAllowKeepData) {
    failures.push(
      "--keep-data requires QA_ALLOW_KEEP_TEST_DATA=true"
    );
  }

  const nextCount = countNextServersUsingProjectNext(env.root);
  context.diagnostics = {
    ...(context.diagnostics || {}),
    nextServersUsingNext: nextCount,
  };
  if (nextCount > 1) {
    failures.push(
      `More than one Next dev server is using this project's .next folder (count=${nextCount})`
    );
  }

  if (failures.length > 0) {
    const error = new Error(
      `QA_ENV_REFUSED: ${failures.join("; ")}`
    );
    error.code = "QA_ENV_REFUSED";
    error.safeDetails = { failureCount: failures.length, codes: failures };
    throw error;
  }
}

export function normaliseSafeError(error) {
  if (!error) return { code: "UNKNOWN", message: "unknown_error" };
  const code =
    error.code ||
    error.safeCode ||
    (typeof error.message === "string" && error.message.startsWith("QA_")
      ? error.message.split(":")[0]
      : "QA_ERROR");
  const message =
    typeof error.message === "string"
      ? error.message
          .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
          .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[jwt]")
          .slice(0, 280)
      : "error";
  return {
    code,
    message,
    stage: error.stage || null,
    safeDetails: error.safeDetails || null,
  };
}

export async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker()
  );
  await Promise.all(runners);
  return results;
}

export async function allSettledBounded(tasks, concurrency) {
  return mapWithConcurrency(tasks, concurrency, async task => {
    try {
      const value = await task();
      return { status: "fulfilled", value };
    } catch (reason) {
      return { status: "rejected", reason };
    }
  });
}

export function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const idx = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1)
  );
  return sortedValues[idx];
}

export function summariseDurations(durations) {
  const sorted = [...durations].filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) {
    return { count: 0, p50: null, p95: null, max: null };
  }
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
  };
}

export function ensureDirExists(path) {
  mkdirSync(path, { recursive: true });
}

export { ROOT };
