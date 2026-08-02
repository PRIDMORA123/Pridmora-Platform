/**
 * Authenticated QA: Current Position vs Current Focus must not duplicate.
 * Seeds a temporary coach + Sarah-shaped relationship, then asserts display copy.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "tmp/current-position-dedupe-qa");
mkdirSync(outDir, { recursive: true });

function loadEnv() {
  const envPath = resolve(root, ".env.local");
  const text = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.APP_URL || "http://localhost:3000";

const purpose =
  "To build confidence and capability as a new operational leader by strengthening delegation, accountability, strategic thinking and leadership presence.";

const approvedSummary =
  "Sarah reflected on an experience of stepping back from an operational issue and recognised that quality was maintained while her supervisor had space to demonstrate capability. She described feeling proud of the outcome and noticed discomfort at not being directly involved. The session also explored her awareness of wanting to improve confidence, presence and team leadership.";

if (!url || !serviceKey) {
  console.error("Missing Supabase env.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `position-qa-${Date.now()}@identity.test`;
const password = `PositionQa!${Date.now()}x`;
let userId = null;
let clientId = null;
let sessionId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalise(value) {
  return (value ?? "")
    .toLowerCase()
    .replace(/^to\s+/u, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function seed() {
  const { data: created, error: createUserError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  assert(
    !createUserError && created.user,
    `createUser failed: ${createUserError?.message}`
  );
  userId = created.user.id;

  await admin.from("profiles").upsert({
    id: userId,
    full_name: "Position QA Coach",
    professional_title: "Executive Coach",
  });

  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      coach_id: userId,
      name: "Sarah Thompson",
      organisation: "Northbridge NHS Trust",
      role: "Operations Manager",
      status: "Active",
      current_focus: purpose,
      identity_summary: null,
    })
    .select("id")
    .single();
  assert(!clientError && client, `create client failed: ${clientError?.message}`);
  clientId = client.id;

  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .insert({
      client_id: clientId,
      coach_id: userId,
      session_number: 1,
      title: "Delegation and ownership",
      session_date: "2026-07-31",
      status: "awaiting_completion",
      focus: "confidence building",
      summary: approvedSummary,
      summary_status: "approved",
      ai_summary_approved: true,
      commitments:
        "- Continue asking supervisors to propose solutions before offering advice.\n- Introduce short reflective discussions after significant incidents.",
      agreed_actions:
        "- Continue asking supervisors to propose solutions before offering advice.\n- Introduce short reflective discussions after significant incidents.",
      notes: "Private note that must never appear.",
    })
    .select("id")
    .single();
  assert(
    !sessionError && session,
    `create session failed: ${sessionError?.message}`
  );
  sessionId = session.id;
}

async function cleanup() {
  if (sessionId) await admin.from("sessions").delete().eq("id", sessionId);
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

async function main() {
  const results = {
    openedSarah: false,
    statement: "",
    currentFocus: "",
    outstandingCommitment: "",
    duplicate: true,
    containsPrivateNote: false,
    passed: false,
  };

  try {
    await seed();

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    await page.goto(`${appUrl}/auth/sign-in`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes("/auth/sign-in"), {
      timeout: 30000,
    });

    const viewRelationship = page.getByRole("button", {
      name: /View relationship/i,
    });
    if ((await viewRelationship.count()) > 0) {
      await viewRelationship.first().click();
    } else {
      await page.getByRole("button", { name: /^People$/i }).click();
      await page.waitForTimeout(800);
      await page.getByText("Sarah Thompson", { exact: false }).first().click();
    }

    try {
      await page.waitForSelector(".current-position-panel", { timeout: 30000 });
    } catch (error) {
      await page.screenshot({
        path: resolve(outDir, "failure.png"),
        fullPage: true,
      });
      const bodyText = await page.locator("body").innerText();
      writeFileSync(
        resolve(outDir, "failure-body.txt"),
        bodyText.slice(0, 8000)
      );
      throw error;
    }
    results.openedSarah = true;

    results.statement =
      (await page.locator(".current-position-panel__statement").textContent())?.trim() ||
      "";
    results.currentFocus =
      (
        await page
          .locator(".current-position-panel__details > div")
          .nth(0)
          .locator(".current-position-panel__value")
          .textContent()
      )?.trim() || "";
    results.outstandingCommitment =
      (
        await page
          .locator(".current-position-panel__details > div")
          .nth(1)
          .locator(".current-position-panel__value")
          .textContent()
      )?.trim() || "";

    results.duplicate =
      normalise(results.statement) === normalise(results.currentFocus);
    results.containsPrivateNote = /private note/i.test(
      (await page.locator(".current-position-panel").textContent()) || ""
    );

    await page.screenshot({
      path: resolve(outDir, "current-position-desktop.png"),
      fullPage: true,
    });

    results.passed =
      results.openedSarah &&
      !results.duplicate &&
      Boolean(results.statement) &&
      Boolean(results.currentFocus) &&
      Boolean(results.outstandingCommitment) &&
      results.outstandingCommitment !== "None recorded" &&
      !results.containsPrivateNote &&
      !/development story is still forming/i.test(results.statement) &&
      !/beginning this coaching relationship/i.test(results.statement) &&
      /stepping back|operational/i.test(results.statement) &&
      /delegation|confidence/i.test(results.currentFocus);

    await browser.close();
  } finally {
    await cleanup();
    writeFileSync(resolve(outDir, "results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  }

  if (!results.passed) process.exit(1);
}

main().catch(async error => {
  console.error(error);
  await cleanup();
  process.exit(1);
});
