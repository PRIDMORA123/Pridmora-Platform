/**
 * Authenticated Relationship Canvas visual QA.
 * Creates a temporary coach + Sarah Thompson relationship with sessions,
 * signs in via the browser, screenshots desktop + mobile, then cleans up.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "tmp/relationship-canvas-qa");
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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const appUrl = process.env.APP_URL || "http://localhost:3000";

if (!url || !serviceKey || !anonKey) {
  console.error("Missing Supabase env.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `canvas-qa-${Date.now()}@identity.test`;
const password = `CanvasQa!${Date.now()}x`;
let userId = null;
let clientId = null;
const sessionIds = [];

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
    full_name: "QA Coach",
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
        "Build confidence in enabling supervisors to take greater ownership.",
      identity_summary:
        "Sarah is moving from direct operational problem-solving towards leading through others. Delegation is becoming more consistent, although she still feels drawn to intervene when standards appear at risk.",
    })
    .select("id")
    .single();
  assert(!clientError && client, `create client failed: ${clientError?.message}`);
  clientId = client.id;

  const sessions = [
    {
      session_number: 1,
      title: "Settling into the role",
      session_date: "2026-07-01",
      status: "completed",
      focus: "Role transition",
      outcomes: "Clarified priorities for the first 90 days.",
      commitments: "Protect weekly thinking time.",
      summary_status: "approved",
      ai_summary_approved: true,
      completed_at: new Date().toISOString(),
    },
    {
      session_number: 2,
      title: "Delegation and ownership",
      session_date: "2026-07-31",
      status: "completed",
      focus: "Delegation",
      outcomes:
        "Sarah recognised that stepping back creates opportunities for supervisors to demonstrate capability.",
      commitments:
        "Continue asking solution-focused questions before offering advice.",
      summary_status: "approved",
      ai_summary_approved: true,
      completed_at: new Date().toISOString(),
    },
    {
      session_number: 3,
      title: "Building leadership confidence",
      session_date: "2026-09-12",
      status: "prepared",
      focus:
        "Explore how Sarah can maintain standards while allowing supervisors greater ownership.",
      prep_purpose:
        "Explore how Sarah can maintain standards while allowing supervisors greater ownership.",
      prep_questions: "What would greater ownership look like this month?",
      summary_status: "not_generated",
      ai_summary_approved: false,
    },
  ];

  for (const session of sessions) {
    const { data, error } = await admin
      .from("sessions")
      .insert({
        client_id: clientId,
        coach_id: userId,
        ...session,
      })
      .select("id")
      .single();
    assert(!error && data, `create session failed: ${error?.message}`);
    sessionIds.push(data.id);
  }
}

async function cleanup() {
  if (sessionIds.length) {
    await admin.from("sessions").delete().in("id", sessionIds);
  }
  if (clientId) {
    await admin.from("clients").delete().eq("id", clientId);
  }
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
}

const results = {
  signedIn: false,
  openedSarah: false,
  identityFirst: false,
  currentPositionVisible: false,
  onePrimaryAction: false,
  currentConversationVisible: false,
  developmentBeforeReports: false,
  coachingMomentsAfterReports: false,
  relationshipDetailsLast: false,
  oneNewCoachingMoment: false,
  noDuplicatePlanNext: false,
  prepareModulePresent: false,
  noJourneyStepper: false,
  desktopScreenshot: null,
  mobileScreenshot: null,
  errors: [],
};

try {
  await seed();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  page.on("pageerror", err => {
    results.errors.push(String(err.message || err));
  });

  await page.goto(`${appUrl}/auth/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes("/auth/sign-in"), {
    timeout: 20000,
  });
  results.signedIn = true;

  // Open Relationship Canvas via Home "View relationship"
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
  await page.waitForTimeout(2500);
  results.openedSarah = true;

  // Prefer relationship workspace; fall back diagnostics if missing.
  const canvas = page.locator(".relationship-workspace, .relationship-canvas");
  try {
    await canvas.first().waitFor({ timeout: 20000 });
  } catch (error) {
    const diagnosticPath = resolve(outDir, "failure.png");
    await page.screenshot({ path: diagnosticPath, fullPage: true });
    results.desktopScreenshot = diagnosticPath;
    const bodyText = await page.locator("body").innerText();
    writeFileSync(resolve(outDir, "failure-body.txt"), bodyText.slice(0, 8000));
    results.errors.push(
      `Canvas missing. Visible text sample: ${bodyText.slice(0, 500)}`
    );
    throw error;
  }

  const hierarchy = await page.evaluate(() => {
    const ids = [
      "current-position-title",
      "current-conversation-title",
      "development-snapshot-title",
      "previous-conversations-title",
      "reports-title",
      "coaching-moments-title",
      "relationship-details-title",
    ];
    const nodes = ids
      .map(id => document.getElementById(id))
      .filter(Boolean);
    const ordered = [...nodes].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
    return ordered.map(node => node.id);
  });

  results.identityFirst = (await page.locator("h1").first().innerText()).includes(
    "Sarah Thompson"
  );
  results.currentPositionVisible =
    (await page.locator("#current-position-title").count()) > 0;
  results.onePrimaryAction =
    (await page
      .locator(".relationship-workspace__primary-action .identity-button.is-primary")
      .count()) === 1;
  results.currentConversationVisible = await page
    .locator(".current-conversation-card")
    .getByText("Building leadership confidence")
    .isVisible();
  results.developmentBeforeReports =
    hierarchy.indexOf("development-snapshot-title") >= 0 &&
    hierarchy.indexOf("development-snapshot-title") <
      hierarchy.indexOf("reports-title");
  results.coachingMomentsAfterReports =
    hierarchy.indexOf("reports-title") <
      hierarchy.indexOf("coaching-moments-title") &&
    hierarchy.indexOf("coaching-moments-title") <
      hierarchy.indexOf("relationship-details-title");
  results.relationshipDetailsLast =
    hierarchy[hierarchy.length - 1] === "relationship-details-title";
  results.oneNewCoachingMoment =
    (await page.getByRole("button", { name: "New Coaching Moment" }).count()) ===
    1;
  results.noDuplicatePlanNext =
    (await page.getByRole("button", { name: "Plan next conversation" }).count()) ===
    0;
  results.prepareModulePresent = await page
    .locator(".session-module-tile", { hasText: "Prepare" })
    .first()
    .isVisible();
  results.noJourneyStepper =
    (await page.locator(".identity-coaching-journey").count()) === 0;
  results.hierarchy = hierarchy;

  const desktopPath = resolve(outDir, "desktop-1440.png");
  await page.screenshot({ path: desktopPath, fullPage: true });
  results.desktopScreenshot = desktopPath;

  // Create one Coaching Moment and confirm it does not become a session.
  await page.getByRole("button", { name: "New Coaching Moment" }).click();
  await page.waitForSelector(".coaching-moment-workspace", { timeout: 10000 });
  const situationField = page.locator(
    ".coaching-moment-workspace textarea"
  ).first();
  await situationField.fill(
    "Quick hallway check-in about a manager escalation."
  );
  await page
    .locator(".identity-modal__footer")
    .getByRole("button", { name: "Continue without guidance" })
    .click();
  await page.waitForTimeout(1200);
  const happened = page.locator("#coaching-moment-happened");
  if ((await happened.count()) > 0) {
    await happened.fill(
      "Manager owned the next step without the coach taking control."
    );
    await page
      .locator(".identity-modal__footer")
      .getByRole("button", { name: "Save coaching moment" })
      .click();
    await page.waitForTimeout(1500);
    const done = page
      .locator(".identity-modal__footer")
      .getByRole("button", { name: "Done" });
    if ((await done.count()) > 0) {
      await done.click();
    }
  } else {
    await page
      .locator(".identity-modal__footer")
      .getByRole("button", { name: /Close|Cancel/i })
      .click();
  }
  await page.waitForTimeout(800);

  // Confirm hierarchy preserved after moment interaction
  const hierarchyAfter = await page.evaluate(() => {
    const ids = [
      "current-position-title",
      "current-conversation-title",
      "development-snapshot-title",
      "previous-conversations-title",
      "reports-title",
      "coaching-moments-title",
      "relationship-details-title",
    ];
    return ids
      .map(id => document.getElementById(id))
      .filter(Boolean)
      .sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      )
      .map(node => node.id);
  });
  results.hierarchyPreserved =
    JSON.stringify(hierarchyAfter) === JSON.stringify(hierarchy);
  results.momentDidNotBecomeSession =
    (await page.locator(".session-module-tile").count()) === 5 &&
    !(await page
      .locator(".current-conversation-card")
      .getByText(/hallway check-in/i)
      .count());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mobilePath = resolve(outDir, "mobile-390.png");
  await page.screenshot({ path: mobilePath, fullPage: true });
  results.mobileScreenshot = mobilePath;

  // Overflow check
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 1;
  });
  results.mobileOverflow = overflow;

  await browser.close();
} catch (error) {
  results.errors.push(error instanceof Error ? error.message : String(error));
} finally {
  await cleanup();
}

writeFileSync(resolve(outDir, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

if (
  !results.signedIn ||
  !results.openedSarah ||
  !results.identityFirst ||
  !results.currentPositionVisible ||
  !results.onePrimaryAction ||
  !results.currentConversationVisible ||
  !results.developmentBeforeReports ||
  !results.coachingMomentsAfterReports ||
  !results.relationshipDetailsLast ||
  !results.oneNewCoachingMoment ||
  !results.noDuplicatePlanNext ||
  !results.prepareModulePresent ||
  !results.noJourneyStepper ||
  !results.hierarchyPreserved ||
  !results.momentDidNotBecomeSession ||
  results.mobileOverflow ||
  results.errors.length
) {
  process.exit(1);
}
