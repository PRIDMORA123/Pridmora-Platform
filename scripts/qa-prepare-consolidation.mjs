/**
 * Authenticated Prepare consolidation + Session 2 Summary availability QA.
 *
 * Requires APP_URL so the script never silently hits the wrong port.
 * Example:
 *   APP_URL=http://127.0.0.1:3001 node scripts/qa-prepare-consolidation.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "tmp/prepare-consolidation-qa");
const artifactsDir = resolve(root, "artifacts");
mkdirSync(outDir, { recursive: true });
mkdirSync(artifactsDir, { recursive: true });

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
    "APP_URL is required. Example:\n  APP_URL=http://127.0.0.1:3001 node scripts/qa-prepare-consolidation.mjs"
  );
  process.exit(1);
}

console.log({
  appUrl,
  test: "prepare-consolidation",
});

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `prepare-consol-qa-${Date.now()}@identity.test`;
const password = `PrepareConsol!${Date.now()}x`;
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
    full_name: "Prepare Consolidation QA",
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
      current_focus:
        "Strengthen delegation and accountability without taking control.",
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
      prep_purpose:
        "Clarify what Daniel wants to change in his delegation approach.",
      notes: "Daniel named the pressure response clearly.",
      reflect_what_surprised: "He recognised how quickly he takes control.",
      commitments: "Leave one decision with a manager this week.",
      summary_status: "approved",
      ai_summary_approved: true,
      summary:
        "Daniel is working on holding accountability without taking control.",
      emerging_themes: "Over-involvement under pressure",
      suggested_focus: "Practise stepping back on one decision.",
    })
    .select("id")
    .single();
  assert(
    !session1Error && session1,
    `create session 1 failed: ${session1Error?.message}`
  );
  sessionIds.push(session1.id);

  const { data: session2, error: session2Error } = await admin
    .from("sessions")
    .insert({
      client_id: clientId,
      coach_id: userId,
      session_number: 2,
      title: "Holding accountability without taking control",
      session_date: "2026-08-05",
      status: "prepared",
      focus: "Holding accountability without taking control",
      prep_purpose: "",
      prep_topics: "",
      prep_questions: "",
      summary_status: "not_generated",
    })
    .select("id")
    .single();
  assert(
    !session2Error && session2,
    `create session 2 failed: ${session2Error?.message}`
  );
  sessionIds.push(session2.id);
}

async function cleanup() {
  const deleted = {
    sessions: [],
    clientId: null,
    profileId: null,
    authUserId: null,
    email: null,
  };

  for (const id of sessionIds) {
    const { error } = await admin.from("sessions").delete().eq("id", id);
    if (!error) deleted.sessions.push(id);
  }
  if (clientId) {
    const { error } = await admin.from("clients").delete().eq("id", clientId);
    if (!error) deleted.clientId = clientId;
  }
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    deleted.profileId = userId;
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (!error) {
      deleted.authUserId = userId;
      deleted.email = email;
    }
  }

  return deleted;
}

async function capturePrepareDiagnostics(page, label, consoleErrors, failedRequests) {
  const diagnostics = {
    label,
    currentUrl: page.url(),
    appUrl,
    title: await page.title().catch(() => ""),
    headings: await page.getByRole("heading").allTextContents().catch(() => []),
    preparationStatus:
      (
        await page
          .locator(".preparation-status__title, .prepare-ready__label")
          .allTextContents()
          .catch(() => [])
      ).join(" | ") || null,
    startConversationCount: await page
      .getByRole("button", { name: "Start conversation" })
      .count()
      .catch(() => 0),
    bodySample: (await page.locator("body").innerText().catch(() => "")).slice(
      0,
      2000
    ),
    consoleErrors: consoleErrors.slice(-20),
    failedRequests: failedRequests.slice(-20),
  };

  console.error("Prepare readiness wait failed", diagnostics);
  writeFileSync(
    resolve(outDir, "prepare-timeout-diagnostics.json"),
    JSON.stringify(diagnostics, null, 2)
  );
  await page.screenshot({
    path: resolve(artifactsDir, "qa-prepare-timeout.png"),
    fullPage: true,
  });
  await page.screenshot({
    path: resolve(outDir, "qa-prepare-timeout.png"),
    fullPage: true,
  });
  return diagnostics;
}

async function waitForPreparationReady(page, consoleErrors, failedRequests) {
  const preparationReady = page.getByText("Preparation ready", {
    exact: true,
  });

  try {
    // Prefer ready state; also accept that refreshing may appear first.
    await Promise.race([
      preparationReady.waitFor({ state: "visible", timeout: 45_000 }),
      page
        .getByRole("heading", { name: "Primary focus" })
        .waitFor({ state: "visible", timeout: 45_000 }),
      page
        .getByRole("button", { name: "Start conversation" })
        .waitFor({ state: "visible", timeout: 45_000 }),
    ]);

    // If still refreshing, wait specifically for the ready status.
    const refreshing = page.getByText("Refreshing preparation…", {
      exact: true,
    });
    if ((await refreshing.count()) > 0 && (await refreshing.isVisible())) {
      await preparationReady.waitFor({ state: "visible", timeout: 45_000 });
    } else if ((await preparationReady.count()) === 0) {
      await preparationReady.waitFor({ state: "visible", timeout: 45_000 });
    }
  } catch (error) {
    await capturePrepareDiagnostics(
      page,
      "waitForPreparationReady",
      consoleErrors,
      failedRequests
    );
    throw error;
  }
}

async function assertCanonicalPrepareBrief(page) {
  const preparationReady = page.getByText("Preparation ready", {
    exact: true,
  });
  await preparationReady.first().waitFor({ state: "visible", timeout: 10_000 });

  const readyCount = await page
    .getByText("Preparation ready", { exact: true })
    .count();
  if (readyCount !== 1) {
    throw new Error(
      `Expected one Preparation ready state, found ${readyCount}`
    );
  }

  await page
    .getByRole("heading", { name: "Primary focus" })
    .waitFor({ state: "visible", timeout: 10_000 });
  await page
    .getByRole("heading", { name: "Areas to explore" })
    .waitFor({ state: "visible", timeout: 10_000 });
  await page
    .getByRole("heading", { name: "Questions to consider" })
    .waitFor({ state: "visible", timeout: 10_000 });

  const startButton = page.getByRole("button", {
    name: "Start conversation",
  });
  await startButton.waitFor({ state: "visible", timeout: 10_000 });
  assert(await startButton.isEnabled(), "Start conversation should be enabled");
  assert(
    (await startButton.count()) === 1,
    `Expected one Start conversation button, found ${await startButton.count()}`
  );

  assert(
    (await page.getByRole("button", { name: "Use prepared draft" }).count()) ===
      0,
    "Legacy Use prepared draft control must not render"
  );
  assert(
    (await page.getByRole("button", { name: "Review draft" }).count()) === 0,
    "Legacy Review draft control must not render"
  );
  assert(
    (await page.getByRole("button", { name: "Close session brief" }).count()) ===
      0,
    "Legacy Close session brief control must not render"
  );
  assert(
    (await page.getByRole("button", { name: "Review session brief" }).count()) ===
      0,
    "Legacy Review session brief control must not render"
  );
  assert(
    (await page.getByText("Your conversation draft is ready").count()) === 0,
    "Legacy conversation draft panel must not render"
  );

  const criticalBriefText = await page
    .locator(
      [
        ".preparation-brief__focus",
        ".preparation-brief__list",
        ".preparation-brief__questions",
        ".preparation-brief__commitment",
      ].join(", ")
    )
    .allTextContents();

  for (const text of criticalBriefText) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (/…\s*$/.test(trimmed) || /\.\.\.\s*$/.test(trimmed)) {
      throw new Error(`Truncated preparation content detected: ${trimmed}`);
    }
  }
}

async function openRelationship(page) {
  await page.waitForTimeout(500);

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

    const person = page.getByText("Daniel Reed", { exact: false });
    await person.first().waitFor({ state: "visible", timeout: 30_000 });
    await person.first().click({ force: true });
  }

  await page.locator(".relationship-canvas").waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

async function openPrepare(page) {
  await openRelationship(page);
  const prepareTile = page.locator(".session-module-tile", {
    hasText: "Prepare",
  });
  if ((await prepareTile.count()) > 0) {
    await prepareTile.first().click({ force: true });
  } else {
    await page
      .getByRole("button", {
        name: /Prepare|Continue preparation|Review preparation/i,
      })
      .first()
      .click({ force: true });
  }
  await page.locator(".preparation-brief, .identity-prepare-workspace").first().waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

async function main() {
  const projectHost = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "unknown";
    }
  })();

  const consoleErrors = [];
  const failedRequests = [];

  const results = {
    projectHost,
    appUrl,
    timedOutWait: null,
    created: {
      authUserId: null,
      email: null,
      profileId: null,
      clientId: null,
      clientName: "Daniel Reed",
      sessionIds: [],
    },
    deleted: {
      sessions: [],
      clientId: null,
      profileId: null,
      authUserId: null,
      email: null,
    },
    openedPrepare: false,
    oneBriefing: false,
    noDuplicateDraft: false,
    noOpenCloseBrief: false,
    completeSentences: false,
    refinePresent: false,
    oneStartConversation: false,
    startConversationEnabled: false,
    approachPresent: false,
    notesMakeIntelligenceAvailable: false,
    session2IdCorrect: false,
    backToSession: false,
    desktopScreenshot: "",
    mobileScreenshot: "",
    bodySample: "",
    passed: false,
    error: "",
  };

  try {
    await seed();
    results.created = {
      authUserId: userId,
      email,
      profileId: userId,
      clientId,
      clientName: "Daniel Reed",
      sessionIds: [...sessionIds],
    };
    results.session2IdCorrect = sessionIds.length === 2;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });

    page.on("console", message => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("requestfailed", request => {
      failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText || "unknown",
      });
    });

    // Sign-in: avoid networkidle in Next.js dev.
    await page.goto(`${appUrl}/auth/sign-in`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator('input[type="email"]').waitFor({
      state: "visible",
      timeout: 30_000,
    });
    // Allow client hydration before submit so the React handler attaches.
    await page.waitForTimeout(1500);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await Promise.all([
      page.waitForURL(
        current => {
          const path = new URL(current).pathname;
          return path === "/" || !path.includes("/auth/sign-in");
        },
        { timeout: 45_000 }
      ),
      page.click('button[type="submit"]'),
    ]);
    await page
      .getByRole("button", { name: /New person|People|Sign out/i })
      .first()
      .waitFor({ state: "visible", timeout: 45_000 });

    await openPrepare(page);
    results.openedPrepare = true;

    // Open approach selector so Assisted can be chosen if needed.
    const changeApproach = page.getByRole("button", {
      name: /Change approach/i,
    });
    if ((await changeApproach.count()) > 0) {
      await changeApproach.first().click();
      await page.waitForTimeout(400);
    }

    // Prefer Assisted, but do not try to save if it is already selected.
    const assistedOption = page.getByRole("radio", {
      name: /Assisted/i,
    });
    const assistedExists = await assistedOption.count();

    if (assistedExists > 0) {
      const isAlreadySelected = await assistedOption.isChecked();

      if (!isAlreadySelected) {
        await assistedOption.check();

        const saveApproachButton = page
          .getByRole("button", {
            name: /Save approach|Use this approach|Confirm/i,
          })
          .first();

        await saveApproachButton.waitFor({
          state: "visible",
          timeout: 10_000,
        });

        // Locator-based enabled wait — no page.waitForFunction / body text scan.
        const enabledSave = page.locator(
          "button:not([disabled]):not([aria-disabled='true'])",
          {
            hasText: /Save approach|Use this approach|Confirm/i,
          }
        );
        await enabledSave.first().waitFor({
          state: "visible",
          timeout: 10_000,
        });
        await enabledSave.first().click();
      } else {
        await page.keyboard.press("Escape");
      }
    } else if ((await changeApproach.count()) > 0) {
      await page.keyboard.press("Escape");
    }

    // Refresh only when an enabled refresh action is available.
    const refreshBriefButtons = page.getByRole("button", {
      name: /Refresh brief|Refresh preparation|^Refresh$/i,
    });

    if ((await refreshBriefButtons.count()) > 0) {
      const refreshBriefButton = refreshBriefButtons.first();
      if (
        (await refreshBriefButton.isVisible()) &&
        (await refreshBriefButton.isEnabled())
      ) {
        results.timedOutWait = "Preparation ready (after Refresh)";
        await refreshBriefButton.click();
        await waitForPreparationReady(page, consoleErrors, failedRequests);
        results.timedOutWait = null;
      }
    } else {
      // Auto-prepare may already be running on first open.
      results.timedOutWait = "Preparation ready (initial)";
      await waitForPreparationReady(page, consoleErrors, failedRequests);
      results.timedOutWait = null;
    }

    await assertCanonicalPrepareBrief(page);

    const bodyText = await page.locator("body").innerText();
    results.bodySample = bodyText.slice(0, 2000);
    const normalisedBody = bodyText.toLowerCase();

    results.oneBriefing =
      (await page.getByRole("heading", { name: "Primary focus" }).count()) ===
        1 &&
      (await page.getByText("Preparation ready", { exact: true }).count()) === 1;
    results.noDuplicateDraft =
      !normalisedBody.includes("your conversation draft is ready") &&
      !normalisedBody.includes("use prepared draft") &&
      !normalisedBody.includes("review draft");
    results.noOpenCloseBrief =
      !normalisedBody.includes("open full brief") &&
      !normalisedBody.includes("close session brief") &&
      !normalisedBody.includes("review session brief");
    results.completeSentences = true;
    results.refinePresent = normalisedBody.includes("refine preparation");
    results.approachPresent = normalisedBody.includes("preparation approach");
    results.oneStartConversation =
      (await page.getByRole("button", { name: "Start conversation" }).count()) ===
      1;
    results.startConversationEnabled = await page
      .getByRole("button", { name: "Start conversation" })
      .isEnabled();

    results.desktopScreenshot = resolve(outDir, "prepare-desktop.png");
    await page.screenshot({
      path: results.desktopScreenshot,
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    results.mobileScreenshot = resolve(outDir, "prepare-mobile.png");
    await page.screenshot({
      path: results.mobileScreenshot,
      fullPage: true,
    });

    // Back to Session N (or Return to relationship fallback)
    await page.setViewportSize({ width: 1440, height: 900 });
    const back = page.getByRole("button", {
      name: /Back to Session|Return to relationship/i,
    });
    if ((await back.count()) > 0) {
      await back.first().click({ force: true });
      try {
        await page.locator(".relationship-canvas").waitFor({
          state: "visible",
          timeout: 20_000,
        });
        results.backToSession = true;
      } catch {
        await page.screenshot({
          path: resolve(outDir, "back-to-session-failure.png"),
          fullPage: true,
        });
      }
    }

    // Persist notes for Session 2, then reopen the relationship workspace.
    const session2Id = sessionIds[1];
    const { error: notesError } = await admin
      .from("sessions")
      .update({
        status: "awaiting_completion",
        notes: "Useful shift in ownership language.",
        reflect_what_surprised:
          "Daniel paused before intervening and named the risk of taking control.",
        commitments: "Ask managers for a proposed decision first.",
        summary_status: "not_generated",
      })
      .eq("id", session2Id);
    if (notesError) {
      throw new Error(`Session 2 notes update failed: ${notesError.message}`);
    }

    await page.goto(appUrl, { waitUntil: "domcontentloaded" });
    try {
      await openRelationship(page);
    } catch (relationshipError) {
      await page.screenshot({
        path: resolve(outDir, "relationship-after-notes-failure.png"),
        fullPage: true,
      });
      // One retry via People navigation.
      await page.goto(`${appUrl}/`, { waitUntil: "domcontentloaded" });
      await page
        .getByRole("button", { name: /^People$/i })
        .first()
        .click({ force: true })
        .catch(() => undefined);
      await page.waitForTimeout(800);
      await page
        .getByText("Daniel Reed", { exact: false })
        .first()
        .click({ force: true });
      await page.locator(".relationship-canvas").waitFor({
        state: "visible",
        timeout: 30_000,
      });
      void relationshipError;
    }
    await page.waitForTimeout(1200);

    const bodyAfterNotes = await page.locator("body").innerText();
    const intelTile = page.locator(".session-module-tile", {
      hasText: "Pridmora Intelligence",
    });
    const intelText =
      (await intelTile.count()) > 0
        ? await intelTile.first().innerText()
        : bodyAfterNotes;
    results.notesMakeIntelligenceAvailable =
      /Create Summary & Insights|Pridmora Intelligence/i.test(intelText) &&
      !/available after session notes/i.test(intelText);

    await page.screenshot({
      path: resolve(outDir, "session2-after-notes.png"),
      fullPage: true,
    });
    writeFileSync(
      resolve(outDir, "session2-after-notes.txt"),
      bodyAfterNotes.slice(0, 5000)
    );

    results.passed =
      results.openedPrepare &&
      results.oneBriefing &&
      results.noDuplicateDraft &&
      results.noOpenCloseBrief &&
      results.completeSentences &&
      results.refinePresent &&
      results.oneStartConversation &&
      results.startConversationEnabled &&
      results.approachPresent &&
      results.notesMakeIntelligenceAvailable &&
      results.session2IdCorrect;

    await browser.close();
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    results.passed = false;
  } finally {
    results.deleted = await cleanup();
    writeFileSync(resolve(outDir, "results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  }

  if (!results.passed) process.exit(1);
}

main().catch(async error => {
  console.error(error);
  try {
    await cleanup();
  } catch {
    // best-effort cleanup after unexpected failure
  }
  process.exit(1);
});
