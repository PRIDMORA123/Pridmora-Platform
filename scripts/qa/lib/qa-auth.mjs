/**
 * Disposable coach account creation and authenticated cookie sessions.
 * Cookies are established via Playwright sign-in so they match @supabase/ssr.
 */
import { chromium } from "playwright";
import {
  cleanupDisposableAuthUser,
  verifyDisposableUserCleanup,
} from "./qa-disposable-user-cleanup.mjs";
import { createAdminClient } from "./qa-supabase.mjs";

export async function createCoachAccount(context, coachIndex) {
  const admin = context.admin;
  const runId = context.runId;
  const email = `mcqa-${runId}-coach-${coachIndex}@identity.test`;
  const password = `McQa!${runId.slice(-10)}${coachIndex}x`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created?.user) {
    const err = new Error("QA_CREATE_COACH_FAILED");
    err.code = "QA_CREATE_COACH_FAILED";
    err.safeDetails = { coachIndex, status: error?.status || null };
    throw err;
  }

  const coachId = created.user.id;
  context.createdAuthUserIds.push(coachId);

  const { error: profileError } = await admin.from("profiles").upsert({
    id: coachId,
    full_name: `QA Coach ${coachIndex} ${runId.slice(-6)}`,
    professional_title: "Executive Coach",
    organisation: `QA Org ${runId.slice(-6)}`,
    preparation_style: "guided",
    coaching_intelligence_mode: "assisted",
  });
  if (profileError) {
    const err = new Error("QA_CREATE_PROFILE_FAILED");
    err.code = "QA_CREATE_PROFILE_FAILED";
    err.safeDetails = { coachIndex };
    throw err;
  }

  const coach = {
    coachId,
    coachIndex,
    email,
    password,
    cookieHeader: null,
    displayName: `QA Coach ${coachIndex}`,
  };
  context.coaches.push(coach);
  return coach;
}

export async function establishCoachCookies(context, coach) {
  const browser = await chromium.launch({ headless: true });
  try {
    const browserContext = await browser.newContext();
    const page = await browserContext.newPage();
    await page.goto(`${context.appUrl}/auth/sign-in`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(300);
    await page
      .locator('input[type="email"], input[name="email"]')
      .first()
      .fill(coach.email);
    await page
      .locator('input[type="password"], input[name="password"]')
      .first()
      .fill(coach.password);
    const submit = page.locator('button[type="submit"]').first();
    if ((await submit.count()) > 0) {
      await submit.click();
    } else {
      await page
        .getByRole("button", { name: /sign in|log in|continue/i })
        .first()
        .click();
    }
    await page.waitForURL(
      url => {
        const path =
          typeof url === "string" ? new URL(url).pathname : url.pathname;
        return path === "/" || !path.includes("/auth/sign-in");
      },
      { timeout: 60_000 }
    );
    await page
      .getByRole("button", { name: /New person|People|Sign out/i })
      .first()
      .waitFor({ state: "visible", timeout: 60_000 });
    const cookies = await browserContext.cookies();
    if (!cookies.length) {
      const err = new Error("QA_AUTH_COOKIES_EMPTY");
      err.code = "QA_AUTH_COOKIES_EMPTY";
      throw err;
    }
    coach.cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    return coach.cookieHeader;
  } finally {
    await browser.close();
  }
}

export async function ensureCoachCookies(context, coach) {
  if (coach.cookieHeader) return coach.cookieHeader;
  return establishCoachCookies(context, coach);
}

/**
 * Delete disposable auth users after removing personal-org dependents.
 * organisations.created_by (NO ACTION) blocks bare deleteUser.
 */
export async function deleteAuthUsers(admin, userIds) {
  let deleted = 0;
  for (const userId of userIds) {
    try {
      await cleanupDisposableAuthUser(admin, userId, {
        log: () => {},
      });
      await verifyDisposableUserCleanup(admin, userId);
      deleted += 1;
    } catch (error) {
      console.error("cleanupDisposableAuthUser failed", {
        userId,
        code: error?.code || null,
        safeDetails: error?.safeDetails || null,
        message: String(error?.message || "").slice(0, 120),
      });
    }
  }
  return deleted;
}

export { createAdminClient };
