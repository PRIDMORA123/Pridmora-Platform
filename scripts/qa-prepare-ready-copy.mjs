/**
 * Authenticated Prepare-page QA for the session-brief-ready copy and review flow.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "tmp/prepare-ready-qa");
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

if (!url || !serviceKey) {
  console.error("Missing Supabase env.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `prepare-qa-${Date.now()}@identity.test`;
const password = `PrepareQa!${Date.now()}x`;
let userId = null;
let clientId = null;
let sessionId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    full_name: "Prepare QA Coach",
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
      current_focus:
        "Build confidence in delegation, accountability and strategic leadership.",
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
      title: "Building leadership confidence",
      session_date: "2026-08-05",
      status: "prepared",
      focus: "Delegation and ownership",
      prep_purpose: "Explore ownership while maintaining standards.",
      prep_topics: "Delegation\nAccountability\nStrategic leadership",
      prep_questions:
        "What are you noticing when you step back?\nWhat support do supervisors need?",
      prep_risks: "",
      prep_private_notes: "",
      summary_status: "not_generated",
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

async function openPrepare(page) {
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

  await page.waitForSelector(".relationship-canvas, .session-brief-card", {
    timeout: 30000,
  });

  const prepareTile = page.locator(".session-module-tile", {
    hasText: "Prepare",
  });
  if ((await prepareTile.count()) > 0) {
    await prepareTile.first().click();
  } else {
    const prepareButton = page.getByRole("button", {
      name: /Prepare|Continue preparation|Review preparation/i,
    });
    await prepareButton.first().click();
  }

  await page.waitForSelector(".prepare-ready, .session-brief-card", {
    timeout: 30000,
  });
}

async function main() {
  const results = {
    openedPrepare: false,
    bodySample: "",
    hasReadyCopy: false,
    hasForbiddenCopy: true,
    reviewOpens: false,
    startPrimary: false,
    mobileStacked: false,
    passed: false,
  };

  try {
    await seed();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });

    await page.goto(`${appUrl}/auth/sign-in`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes("/auth/sign-in"), {
      timeout: 30000,
    });

    await openPrepare(page);
    results.openedPrepare = true;

    const bodyText = await page.locator("body").innerText();
    results.bodySample = bodyText.slice(0, 2500);

    const normalisedBody = bodyText.toLowerCase();
    results.hasReadyCopy =
      normalisedBody.includes("session brief ready") &&
      normalisedBody.includes("your preparation is complete.") &&
      normalisedBody.includes("review session brief") &&
      normalisedBody.includes("start conversation");

    results.hasForbiddenCopy =
      /Optional refinements|Refine preparation|\bShow\b|\bHide\b|Supporting context available|View supporting context|Adjust anything you want to personalise/.test(
        bodyText
      );

    const start = page
      .locator(".prepare-ready__actions .identity-button--primary, .prepare-ready__actions .is-primary")
      .first();
    results.startPrimary = (await start.count()) > 0;

    const review = page.getByRole("button", { name: /^Review session brief$/i });
    await review.first().click();
    await page.waitForSelector(".preparation-refinement__panel", {
      timeout: 10000,
    });
    results.reviewOpens = true;

    await page.screenshot({
      path: resolve(outDir, "prepare-ready-desktop.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const actions = page.locator(".prepare-ready__actions").first();
    const box = await actions.boundingBox();
    const startBox = await page
      .locator(".prepare-ready__actions .identity-button")
      .first()
      .boundingBox();
    const reviewBox = await page
      .locator(".prepare-ready__actions .identity-button")
      .nth(1)
      .boundingBox();
    results.mobileStacked = Boolean(
      box &&
        startBox &&
        reviewBox &&
        reviewBox.y > startBox.y + 8 &&
        Math.abs(startBox.x - reviewBox.x) < 24
    );

    await page.screenshot({
      path: resolve(outDir, "prepare-ready-mobile.png"),
      fullPage: true,
    });

    results.passed =
      results.openedPrepare &&
      results.hasReadyCopy &&
      !results.hasForbiddenCopy &&
      results.reviewOpens &&
      results.startPrimary &&
      results.mobileStacked;

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
