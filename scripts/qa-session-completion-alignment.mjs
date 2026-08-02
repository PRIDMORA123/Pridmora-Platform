/**
 * Authenticated visual QA for session completion / carry-forward alignment.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "tmp/session-completion-qa");
mkdirSync(outDir, { recursive: true });

function loadEnv() {
  const text = readFileSync(resolve(root, ".env.local"), "utf8");
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

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `complete-qa-${Date.now()}@identity.test`;
const password = `CompleteQa!${Date.now()}x`;
let userId = null;
let clientId = null;
let sessionId = null;

const results = {
  signedIn: false,
  openedCompletion: false,
  oneLeftAxis: false,
  cardsShareWidth: false,
  focusIsList: false,
  noJourneyStepper: true,
  desktopScreenshot: null,
  mobileScreenshot: null,
  offsets: null,
  errors: [],
};

async function cleanup() {
  if (sessionId) await admin.from("sessions").delete().eq("id", sessionId);
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

try {
  const { data: created, error: createUserError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createUserError || !created.user) {
    throw new Error(`createUser failed: ${createUserError?.message}`);
  }
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
      current_focus: "Build confidence through delegation",
      identity_summary:
        "Sarah is moving from operational problem-solving towards leading through others.",
    })
    .select("id")
    .single();
  if (clientError || !client) {
    throw new Error(`create client failed: ${clientError?.message}`);
  }
  clientId = client.id;

  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .insert({
      client_id: clientId,
      coach_id: userId,
      session_number: 1,
      title: "Confidence building",
      session_date: "2026-07-31",
      status: "awaiting_completion",
      focus: "Confidence building",
      commitments:
        "Continue asking supervisors to propose solutions before offering advice.\nProtect weekly thinking time.",
      agreed_actions:
        "Continue asking supervisors to propose solutions before offering advice.\nProtect weekly thinking time.",
      suggested_focus:
        "Explore what Sarah notices when she resists intervening – Review how the reflective discussions with her team are landing – Clarify what confidence and presence mean in her leadership – Explore how Sarah wants to balance standards with ownership",
      notes: "Session notes captured",
      notes_saved_at: new Date().toISOString(),
      session_started_at: new Date().toISOString(),
      summary_status: "approved",
      ai_summary_approved: true,
      summary: "Approved summary for the record.",
    })
    .select("id")
    .single();
  if (sessionError || !session) {
    throw new Error(`create session failed: ${sessionError?.message}`);
  }
  sessionId = session.id;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${appUrl}/auth/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes("/auth/sign-in"), {
    timeout: 20000,
  });
  results.signedIn = true;

  const viewRelationship = page.getByRole("button", {
    name: /View relationship/i,
  });
  if ((await viewRelationship.count()) > 0) {
    await viewRelationship.first().click();
  } else {
    await page.getByRole("button", { name: /^People$/i }).click();
    await page.getByText("Sarah Thompson").first().click();
  }
  await page.waitForTimeout(1800);

  // Open Next Focus / completion from current conversation modules if present
  const nextFocus = page.locator(".session-module-tile", {
    hasText: "Next Focus",
  });
  if ((await nextFocus.count()) > 0) {
    await nextFocus.first().click();
  } else {
    const review = page.getByRole("button", {
      name: /Review next focus|Continue Session Notes|Review Summary/i,
    });
    if ((await review.count()) > 0) await review.first().click();
  }
  await page.waitForTimeout(2000);

  // Ensure we are on carry-forward content
  const carryForward = page.getByText("Carry forward what matters");
  await carryForward.first().waitFor({ timeout: 15000 });
  results.openedCompletion = true;

  const desktopPath = resolve(outDir, "desktop-1440.png");
  await page.screenshot({ path: desktopPath, fullPage: true });
  results.desktopScreenshot = desktopPath;

  const metrics = await page.evaluate(() => {
    const picks = [];
    const push = (label, el) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      picks.push({ label, left: Math.round(rect.left * 10) / 10, width: Math.round(rect.width * 10) / 10 });
    };

    push(
      "identity",
      document.querySelector(".relationship-identity-bar__name")
    );
    push(
      "stageTitle",
      document.querySelector(".identity-stage-header__title")
    );
    push(
      "commitmentsCard",
      document.querySelector(".identity-session-surface")
    );
    push(
      "actionsTitle",
      document.querySelector(".identity-actions-header__title")
    );
    push(
      "completionActions",
      document.querySelector(".identity-session-completion-actions")
    );
    push(
      "container",
      document.querySelector(".identity-workspace-container")
    );

    const cards = [...document.querySelectorAll(".identity-session-surface")].map(
      el => Math.round(el.getBoundingClientRect().width * 10) / 10
    );
    const focusList = document.querySelector(".session-next-steps__focus-list");

    return {
      picks,
      cards,
      focusListItems: focusList
        ? focusList.querySelectorAll("li").length
        : 0,
      overflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

  results.offsets = metrics;
  const lefts = metrics.picks
    .filter(item => item.label !== "container")
    .map(item => item.left);
  const minLeft = Math.min(...lefts);
  const maxLeft = Math.max(...lefts);
  // Card content edge may sit inset by card padding from the spine; compare spine items.
  const spine = metrics.picks.filter(item =>
    ["identity", "stageTitle", "actionsTitle", "completionActions", "commitmentsCard"].includes(
      item.label
    )
  );
  const spineLefts = spine.map(item => item.left);
  const spineSpread = Math.max(...spineLefts) - Math.min(...spineLefts);
  // Commitments card shares container left; headings inside cards are padded.
  // Identity/stage/actions/completion should align within 2px; card outer edge with them.
  const outerSpine = metrics.picks.filter(item =>
    ["identity", "stageTitle", "actionsTitle", "completionActions", "commitmentsCard"].includes(
      item.label
    )
  );
  const outerLefts = outerSpine.map(item => item.left);
  results.oneLeftAxis = Math.max(...outerLefts) - Math.min(...outerLefts) <= 2;
  results.cardsShareWidth =
    metrics.cards.length > 0 &&
    Math.max(...metrics.cards) - Math.min(...metrics.cards) <= 1;
  results.focusIsList = metrics.focusListItems >= 2;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobilePath = resolve(outDir, "mobile-390.png");
  await page.screenshot({ path: mobilePath, fullPage: true });
  results.mobileScreenshot = mobilePath;

  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  results.mobileOverflow = mobileOverflow;
  results.spineSpread = spineSpread;
  results.minLeft = minLeft;
  results.maxLeft = maxLeft;

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
  !results.openedCompletion ||
  !results.oneLeftAxis ||
  !results.cardsShareWidth ||
  !results.focusIsList ||
  results.errors.length
) {
  process.exit(1);
}
