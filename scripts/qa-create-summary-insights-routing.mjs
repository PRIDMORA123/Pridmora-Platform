/**
 * Authenticated Session 2 Create Summary & Insights routing QA.
 *
 * Example:
 *   APP_URL=http://127.0.0.1:3002 node scripts/qa-create-summary-insights-routing.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "tmp/create-summary-insights-qa");
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
const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");

if (!url || !serviceKey) {
  console.error("Missing Supabase env.");
  process.exit(1);
}
if (!appUrl) {
  console.error(
    "APP_URL is required. Example:\n  APP_URL=http://127.0.0.1:3002 node scripts/qa-create-summary-insights-routing.mjs"
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `summary-route-qa-${Date.now()}@identity.test`;
const password = `SummaryRoute!${Date.now()}x`;
let userId = null;
let clientId = null;
let session1Id = null;
let session2Id = null;

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
    full_name: "Summary Routing QA",
    professional_title: "Executive Coach",
    preparation_style: "guided",
  });

  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      coach_id: userId,
      name: "Daniel Reed",
      organisation: "Northbridge NHS Trust",
      role: "Operations Director",
      status: "Active",
      current_focus: "Strengthen delegation without taking control.",
    })
    .select("id")
    .single();
  assert(!clientError && client, `create client failed: ${clientError?.message}`);
  clientId = client.id;

  const { data: session1, error: session1Error } = await admin
    .from("sessions")
    .insert({
      client_id: clientId,
      coach_id: userId,
      session_number: 1,
      title: "Clarify ownership under pressure",
      session_date: "2026-07-10",
      status: "completed",
      focus: "Delegation under pressure",
      notes: "Earlier session notes",
      reflect_what_surprised: "He recognised the pattern.",
      commitments: "Leave one decision with a manager.",
      summary: "Session 1 approved summary",
      summary_status: "approved",
      ai_summary_approved: true,
    })
    .select("id")
    .single();
  assert(
    !session1Error && session1,
    `create session 1 failed: ${session1Error?.message}`
  );
  session1Id = session1.id;

  const { data: session2, error: session2Error } = await admin
    .from("sessions")
    .insert({
      client_id: clientId,
      coach_id: userId,
      session_number: 2,
      title: "Hold the line on ownership",
      session_date: "2026-07-24",
      status: "awaiting_completion",
      focus: "Sustain delegation under pressure",
      session_started_at: "2026-07-24T10:00:00.000Z",
      summary_status: "not_generated",
    })
    .select("id")
    .single();
  assert(
    !session2Error && session2,
    `create session 2 failed: ${session2Error?.message}`
  );
  session2Id = session2.id;
}

async function cleanup() {
  try {
    if (session1Id) await admin.from("sessions").delete().eq("id", session1Id);
    if (session2Id) await admin.from("sessions").delete().eq("id", session2Id);
    if (clientId) await admin.from("clients").delete().eq("id", clientId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    return true;
  } catch {
    return false;
  }
}

async function openRelationship(page) {
  const viewRelationship = page.getByRole("button", {
    name: /View relationship/i,
  });
  if ((await viewRelationship.count()) > 0) {
    await viewRelationship.first().click({ force: true });
  } else {
    const people = page.getByRole("button", { name: /^People$/i });
    if ((await people.count()) > 0) {
      await people.first().click({ force: true });
      await page.waitForTimeout(800);
    }
    await page.getByText("Daniel Reed", { exact: false }).first().click({
      force: true,
    });
  }
  await page.locator(".relationship-canvas").waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

async function main() {
  const results = {
    passed: false,
    relationshipId: null,
    session2Id: null,
    saveRequestCount: 0,
    draftSummaryRequestCount: 0,
    landedOnSummary: false,
    sameSessionIds: false,
    notCaptureOutcome: false,
    summaryContentVisible: false,
    summaryReopenable: false,
    notesSeparatelyReopenable: false,
    error: null,
    deleted: false,
  };

  try {
    await seed();
    results.relationshipId = clientId;
    results.session2Id = session2Id;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });

    const saveUrls = [];
    const draftUrls = [];
    page.on("request", request => {
      const u = request.url();
      if (
        request.method() === "POST" ||
        request.method() === "PUT" ||
        request.method() === "PATCH"
      ) {
        if (/\/api\/sessions\b/.test(u)) saveUrls.push(u);
        if (/\/api\/draft-summary\b/.test(u)) draftUrls.push(u);
      }
    });

    await page.goto(`${appUrl}/auth/sign-in`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator('input[type="email"]').waitFor({
      state: "visible",
      timeout: 30_000,
    });
    // Wait for client hydration so the React submit handler is attached
    // (native GET submit would bounce with ?email=&password=).
    await page.waitForTimeout(2500);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
      current => {
        const path = new URL(current).pathname;
        return path === "/" || !path.includes("/auth/sign-in");
      },
      { timeout: 60_000 }
    );
    await page
      .getByRole("button", { name: /New person|People|Sign out/i })
      .first()
      .waitFor({ state: "visible", timeout: 45_000 });

    await openRelationship(page);

    // Ensure Session 2 is the active conversation card if a picker exists.
    const session2Chip = page.getByText(/Session 2/i).first();
    if ((await session2Chip.count()) > 0) {
      await session2Chip.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(500);
    }

    const notesTile = page.locator(".session-module-tile", {
      hasText: "Session Notes",
    });
    await notesTile.first().waitFor({ state: "visible", timeout: 20_000 });
    await notesTile.first().click({ force: true });

    await page
      .getByText(/What stood out\?/i)
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });

    const narrative = page.locator("textarea").first();
    await narrative.fill(
      "Daniel held the line once under pressure and named the pull to take control."
    );
    const commitment = page.locator("textarea").nth(1);
    await commitment.fill(
      "Ask one manager for a proposed decision before intervening."
    );

    await page.getByRole("button", { name: /Save notes only/i }).click();
    await page.waitForTimeout(1500);

    const saveCountBeforeCreate = saveUrls.length;
    const draftCountBeforeCreate = draftUrls.length;

    const createButton = page.getByRole("button", {
      name: /Create Summary & Insights/i,
    });
    await createButton.click();

    // Wait for Summary & Insights (not Capture outcome bounce).
    await page.waitForTimeout(2000);
    await Promise.race([
      page
        .getByText(/AI draft|Summary approved|key insight|session summary/i)
        .first()
        .waitFor({ state: "visible", timeout: 90_000 }),
      page
        .locator(".session-summary-review, .summary-insights")
        .first()
        .waitFor({ state: "visible", timeout: 90_000 }),
    ]).catch(() => undefined);

    await page.waitForTimeout(1500);

    const body = await page.locator("body").innerText();
    results.landedOnSummary =
      /AI draft|Summary & Insights|session summary|key insight/i.test(body) &&
      !/What stood out\?/i.test(body);
    results.notCaptureOutcome = !/What stood out\?/i.test(body);
    results.summaryContentVisible =
      body.trim().length > 40 &&
      (/Daniel|ownership|delegation|pressure|manager/i.test(body) ||
        /AI draft/i.test(body));

    results.saveRequestCount = Math.max(
      0,
      saveUrls.length - saveCountBeforeCreate
    );
    // Save-notes-only already happened; create flow should add ≥1 save + 1 draft.
    // Count drafts from create click only.
    results.draftSummaryRequestCount = Math.max(
      0,
      draftUrls.length - draftCountBeforeCreate
    );

    // Confirm DB still Session 2 with draft/notes.
    const { data: sessionRow } = await admin
      .from("sessions")
      .select("id, client_id, session_number, summary_status, summary, reflect_what_surprised")
      .eq("id", session2Id)
      .single();

    results.sameSessionIds =
      sessionRow?.id === session2Id &&
      sessionRow?.client_id === clientId &&
      sessionRow?.session_number === 2 &&
      Boolean(sessionRow?.reflect_what_surprised?.trim());

    // Return to workspace and reopen Summary & Insights.
    const back = page.getByRole("button", {
      name: /Back|Current Position|Return/i,
    }).first();
    if ((await back.count()) > 0) {
      await back.click({ force: true });
      await page.waitForTimeout(1000);
    }
    await openRelationship(page).catch(() => undefined);

    const intelTile = page.locator(".session-module-tile", {
      hasText: "Pridmora Intelligence",
    });
    if ((await intelTile.count()) > 0) {
      await intelTile.first().click({ force: true });
      await page.waitForTimeout(1500);
      const reopenBody = await page.locator("body").innerText();
      results.summaryReopenable =
        !/What stood out\?/i.test(reopenBody) &&
        (/AI draft|Summary|insight|Daniel|ownership/i.test(reopenBody) ||
          /Draft available|approved/i.test(reopenBody));
    }

    // Reopen Session Notes only through its tile.
    const back2 = page.getByRole("button", {
      name: /Back|Current Position|Return/i,
    }).first();
    if ((await back2.count()) > 0) {
      await back2.click({ force: true });
      await page.waitForTimeout(800);
    }
    await openRelationship(page).catch(() => undefined);
    const notesTile2 = page.locator(".session-module-tile", {
      hasText: "Session Notes",
    });
    if ((await notesTile2.count()) > 0) {
      await notesTile2.first().click({ force: true });
      await page.waitForTimeout(1000);
      const notesBody = await page.locator("body").innerText();
      results.notesSeparatelyReopenable = /What stood out\?/i.test(notesBody);
    }

    results.passed =
      results.landedOnSummary &&
      results.notCaptureOutcome &&
      results.sameSessionIds &&
      results.draftSummaryRequestCount === 1 &&
      results.saveRequestCount >= 1 &&
      results.summaryContentVisible &&
      results.summaryReopenable &&
      results.notesSeparatelyReopenable;

    await page.screenshot({
      path: resolve(outDir, "final.png"),
      fullPage: true,
    });
    writeFileSync(resolve(outDir, "body.txt"), body.slice(0, 8000));

    await browser.close();
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    results.passed = false;
  } finally {
    results.deleted = await cleanup();
    writeFileSync(
      resolve(outDir, "results.json"),
      JSON.stringify(results, null, 2)
    );
    console.log(JSON.stringify(results, null, 2));
    if (!results.passed) process.exit(1);
  }
}

main();
