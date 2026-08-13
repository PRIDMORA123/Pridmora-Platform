#!/usr/bin/env node
/**
 * Auth Reliability Gate — genuine Playwright browser acceptance on Pilot only.
 *
 * Disposable fixtures only. Never mutates IDENTITY. Never touches Customer #1
 * invitations or passwords. Never prints secrets/tokens/passwords.
 *
 * Usage: npm run auth:reliability-gate
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PILOT_REF = "jfcxnkmflfzzxqovkuqw";
const IDENTITY_REF = "lxfdhnwjmtfbawznivbu";
const APP_ORIGIN = "http://127.0.0.1:3001";
const root = process.cwd();

const report = {
  environmentIsolation: null,
  ownerBrowser: null,
  leadBrowser: null,
  managerBrowser: null,
  recovery: null,
  invitationLead: null,
  invitationManager: null,
  refreshNewTabDirect: null,
  invalidPassword: null,
  signOutSignIn: null,
  overall: null,
};

function loadPilotEnv() {
  const path = resolve(root, ".env.pilot.local");
  if (!existsSync(path)) throw new Error("Missing .env.pilot.local");
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, idx).trim()] = value;
  }
  return env;
}

function makePassword(label) {
  return `Gate-${label}-${randomBytes(10).toString("base64url")}!9A`;
}

function extractTokenHash(actionLink) {
  const url = new URL(actionLink);
  const hash = url.searchParams.get("token_hash");
  if (hash) return hash;
  const redirectTo = url.searchParams.get("redirect_to");
  if (redirectTo) {
    try {
      const nested = new URL(redirectTo);
      const nestedHash = nested.searchParams.get("token_hash");
      if (nestedHash) return nestedHash;
    } catch {
      // ignore
    }
  }
  const token = url.searchParams.get("token");
  if (token) return token;
  throw new Error("generateLink missing token_hash");
}

async function waitForServer(origin, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${origin}/auth/sign-in`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok || res.status === 307 || res.status === 308) return;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error(`Server not ready at ${origin}`);
}

async function ensurePilotServer(env) {
  try {
    const res = await fetch(`${APP_ORIGIN}/auth/sign-in`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok || res.status === 307) {
      return { child: null, reused: true };
    }
  } catch {
    // start fresh
  }

  const child = spawn(process.execPath, ["scripts/dev-pilot.mjs"], {
    cwd: root,
    env: { ...process.env, ...env, PRIDMORA_ENV: "pilot" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout?.on("data", chunk => {
    bootLog += String(chunk);
  });
  child.stderr?.on("data", chunk => {
    bootLog += String(chunk);
  });
  try {
    await waitForServer(APP_ORIGIN);
    return { child, reused: false };
  } catch (error) {
    child.kill("SIGTERM");
    const safe = bootLog
      .split("\n")
      .filter(line => !/eyJ|service_role|password/i.test(line))
      .slice(-20)
      .join("\n");
    throw new Error(`${error.message}\nBoot tail:\n${safe}`);
  }
}

async function createUser(admin, email, password, fullName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message || "missing user"}`);
  }
  await admin.from("profiles").upsert({
    id: data.user.id,
    full_name: fullName,
    professional_title: "Gate Fixture",
    preparation_style: "guided",
    coaching_intelligence_mode: "assisted",
  });
  return { id: data.user.id, email };
}

async function browserSignIn(page, email, password) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(`${APP_ORIGIN}/auth/sign-in`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      // If a residual session exists, middleware sends us away from sign-in.
      if (!page.url().includes("/auth/sign-in")) {
        throw new Error(
          `sign_in_blocked_by_session path=${new URL(page.url()).pathname}`
        );
      }
      // Suspense may briefly show "Loading…" — wait for the hydrated fields.
      await page.waitForSelector('input[name="email"]', {
        state: "visible",
        timeout: 45_000,
      });
      await page.waitForSelector('input[name="password"]', {
        state: "visible",
        timeout: 15_000,
      });
      await page.waitForTimeout(400);
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('button[type="submit"]').click();
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1000 * attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("browser_sign_in_failed");
}

async function expectPath(page, predicate, timeout = 60_000) {
  await page.waitForURL(predicate, { timeout });
}

function readAccessTokenFromCookies(cookies) {
  const authCookies = cookies
    .filter(cookie => cookie.name.startsWith(`sb-${PILOT_REF}-auth-token`))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (authCookies.length === 0) return null;

  const candidates = [
    authCookies.find(
      cookie =>
        !cookie.name.endsWith(".0") && !cookie.name.endsWith(".1")
    )?.value,
    authCookies.map(cookie => cookie.value).join(""),
  ].filter(Boolean);

  for (const value of candidates) {
    try {
      const parsed = JSON.parse(decodeURIComponent(value));
      const token =
        parsed?.access_token ||
        parsed?.currentSession?.access_token ||
        parsed?.[0]?.access_token ||
        null;
      if (token) return token;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Sign out via Supabase Auth logout + cookie clear (no dependency on HomeApp UI).
 */
async function signOutViaSession(page, context, supabaseUrl, anonKey) {
  const cookies = await context.cookies();
  const accessToken = readAccessTokenFromCookies(cookies);

  if (accessToken) {
    await fetch(`${supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }).catch(() => undefined);
  }

  await context.clearCookies();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(`${APP_ORIGIN}/auth/sign-in`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      return;
    } catch {
      await sleep(1000 * attempt);
    }
  }
  throw new Error("sign_out_navigate_sign_in_failed");
}

async function main() {
  const env = loadPilotEnv();
  const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "").hostname;
  if (host !== `${PILOT_REF}.supabase.co`) {
    report.environmentIsolation = "FAIL";
    throw new Error(`TARGET_GATE_FAIL host=${host}`);
  }
  if (host.includes(IDENTITY_REF)) {
    throw new Error("IDENTITY_TOUCH_FORBIDDEN");
  }
  if ((env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "") !== APP_ORIGIN) {
    report.environmentIsolation = "FAIL";
    throw new Error("Pilot Site URL must be http://127.0.0.1:3001");
  }
  report.environmentIsolation = "PASS";

  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const anon = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const stamp = Date.now().toString(36);
  const marker = `auth-gate-${stamp}`;
  const password = makePassword("base");
  const passwordNew = makePassword("new");

  /** @type {string[]} */
  const userIds = [];
  /** @type {string[]} */
  const orgIds = [];
  /** @type {import('node:child_process').ChildProcess | null} */
  let server = null;
  let browser = null;

  try {
    const boot = await ensurePilotServer(env);
    server = boot.child;

    const owner = await createUser(
      admin,
      `${marker}-owner@pridmora-pilot.test`,
      password,
      `${marker} Owner`
    );
    userIds.push(owner.id);
    const { error: ownerRowError } = await admin.from("platform_owners").insert({
      user_id: owner.id,
      status: "active",
      notes: marker,
    });
    if (ownerRowError) {
      throw new Error(`platform_owners insert: ${ownerRowError.message}`);
    }

    const lead = await createUser(
      admin,
      `${marker}-lead@pridmora-pilot.test`,
      password,
      `${marker} Lead`
    );
    userIds.push(lead.id);

    const manager = await createUser(
      admin,
      `${marker}-manager@pridmora-pilot.test`,
      password,
      `${marker} Manager`
    );
    userIds.push(manager.id);

    const inviteLead = await createUser(
      admin,
      `${marker}-inv-lead@pridmora-pilot.test`,
      password,
      `${marker} Invite Lead`
    );
    userIds.push(inviteLead.id);

    const inviteManager = await createUser(
      admin,
      `${marker}-inv-mgr@pridmora-pilot.test`,
      password,
      `${marker} Invite Manager`
    );
    userIds.push(inviteManager.id);

    const { data: org, error: orgError } = await admin
      .from("organisations")
      .insert({
        name: `${marker} Org`,
        slug: marker,
        organisation_type: "business",
        status: "active",
        created_by: owner.id,
        ai_enabled: true,
        licence_plan_name: "Pilot",
        practitioner_seats_purchased: 10,
        licence_status: "active",
      })
      .select("id")
      .single();
    if (orgError || !org) throw new Error(`org create: ${orgError?.message}`);
    orgIds.push(org.id);

    for (const row of [
      {
        user_id: lead.id,
        role: "oversight",
        professional_role: null,
      },
      {
        user_id: manager.id,
        role: "practitioner",
        professional_role: "manager",
      },
    ]) {
      const { error } = await admin.from("organisation_memberships").insert({
        organisation_id: org.id,
        user_id: row.user_id,
        role: row.role,
        professional_role: row.professional_role,
        status: "active",
        joined_at: new Date().toISOString(),
      });
      if (error) throw new Error(`membership: ${error.message}`);
    }
    await admin
      .from("profiles")
      .update({ current_organisation_id: org.id })
      .in("id", [lead.id, manager.id]);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await browserSignIn(page, owner.email, password);
    await expectPath(page, url => new URL(url).pathname.startsWith("/owner"));
    report.ownerBrowser = "PASS";

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectPath(page, url => new URL(url).pathname.startsWith("/owner"));
    const tab2 = await context.newPage();
    await tab2.goto(`${APP_ORIGIN}/owner`, { waitUntil: "domcontentloaded" });
    await expectPath(tab2, url => new URL(url).pathname.startsWith("/owner"));
    await tab2.close();
    report.refreshNewTabDirect = "PASS";

    await signOutViaSession(
      page,
      context,
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    await page.goto(`${APP_ORIGIN}/owner`, { waitUntil: "domcontentloaded" });
    await expectPath(page, url =>
      new URL(url).pathname.includes("/auth/sign-in")
    );
    await browserSignIn(page, owner.email, password);
    await expectPath(page, url => new URL(url).pathname.startsWith("/owner"));
    report.signOutSignIn = "PASS";

    await context.clearCookies();
    await browserSignIn(page, owner.email, "definitely-wrong-password-!!!");
    await page.waitForSelector(
      '[data-auth-error-code="AUTH_INVALID_CREDENTIALS"]',
      { timeout: 20_000 }
    );
    report.invalidPassword = "PASS";

    await context.clearCookies();
    await browserSignIn(page, lead.email, password);
    await expectPath(page, url =>
      new URL(url).pathname.startsWith("/organisation")
    );
    report.leadBrowser = "PASS";

    await context.clearCookies();
    await browserSignIn(page, manager.email, password);
    await expectPath(page, url => {
      const u = new URL(url);
      return u.pathname === "/" && u.searchParams.get("view") === "dashboard";
    });
    report.managerBrowser = "PASS";

    const recoveryUser = await createUser(
      admin,
      `${marker}-recovery@pridmora-pilot.test`,
      password,
      `${marker} Recovery`
    );
    userIds.push(recoveryUser.id);

    const link = await admin.auth.admin.generateLink({
      type: "recovery",
      email: recoveryUser.email,
      options: {
        redirectTo: `${APP_ORIGIN}/auth/reset-password`,
      },
    });
    if (link.error || !link.data?.properties?.action_link) {
      throw new Error(`generateLink: ${link.error?.message || "missing link"}`);
    }
    const tokenHash = extractTokenHash(link.data.properties.action_link);
    await context.clearCookies();
    await page.goto(
      `${APP_ORIGIN}/auth/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByRole("button", { name: /continue/i }).click();
    await page.locator('input[name="password"]').fill(passwordNew);
    await page.locator('input[name="confirm_password"]').fill(passwordNew);
    await page.getByRole("button", { name: /update password/i }).click();
    await expectPath(
      page,
      url => new URL(url).pathname.includes("/auth/sign-in"),
      60_000
    );

    const oldDenied = await anon.auth.signInWithPassword({
      email: recoveryUser.email,
      password,
    });
    if (!oldDenied.error) throw new Error("Old password still accepted");
    const newOk = await anon.auth.signInWithPassword({
      email: recoveryUser.email,
      password: passwordNew,
    });
    if (newOk.error) {
      throw new Error(`New password rejected: ${newOk.error.message}`);
    }
    await anon.auth.signOut();
    report.recovery = "PASS";

    const leadToken = randomBytes(32).toString("base64url");
    const leadHash = createHash("sha256").update(leadToken).digest("hex");
    const { error: leadInvErr } = await admin
      .from("organisation_invitations")
      .insert({
        organisation_id: org.id,
        email: inviteLead.email,
        full_name: `${marker} Invite Lead`,
        role: "oversight",
        professional_role: null,
        token_hash: leadHash,
        status: "pending",
        invited_by: owner.id,
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      });
    if (leadInvErr) throw new Error(`lead invite row: ${leadInvErr.message}`);

    async function acceptInvitationInBrowser(email, token, landingCheck) {
      // Fresh browser avoids late-run hydration flakes and host/cookie drift.
      const inviteBrowser = await chromium.launch({ headless: true });
      try {
        const inviteContext = await inviteBrowser.newContext();
        const invitePage = await inviteContext.newPage();
        await browserSignIn(invitePage, email, password);
        await expectPath(
          invitePage,
          url => !new URL(url).pathname.includes("/auth/sign-in"),
          60_000
        );
        // Prove server-visible session before accept (cookie race → marketing `/`
        // still matches "not sign-in" but API accept would 401).
        await invitePage.goto(`${APP_ORIGIN}/organisation`, {
          waitUntil: "domcontentloaded",
        });
        await expectPath(
          invitePage,
          url => {
            const path = new URL(url).pathname;
            return (
              path.startsWith("/organisation") &&
              !path.includes("/auth/sign-in")
            );
          },
          60_000
        );

        const acceptUrl = `${APP_ORIGIN}/organisation/invitations/accept?token=${encodeURIComponent(token)}`;
        await invitePage.goto(acceptUrl, { waitUntil: "domcontentloaded" });
        try {
          await expectPath(invitePage, landingCheck, 60_000);
        } catch (error) {
          const bodyText = (await invitePage.locator("body").innerText())
            .replace(/\s+/g, " ")
            .slice(0, 240);
          throw new Error(
            `invite_accept_landing_failed path=${new URL(invitePage.url()).pathname} body=${bodyText}`
          );
        }
      } finally {
        await inviteBrowser.close().catch(() => undefined);
      }
    }

    await acceptInvitationInBrowser(
      inviteLead.email,
      leadToken,
      url => {
        const u = new URL(url);
        return (
          u.pathname.startsWith("/organisation") &&
          !u.pathname.includes("/invitations/accept")
        );
      }
    );
    report.invitationLead = "PASS";

    const mgrToken = randomBytes(32).toString("base64url");
    const mgrHash = createHash("sha256").update(mgrToken).digest("hex");
    const { error: mgrInvErr } = await admin
      .from("organisation_invitations")
      .insert({
        organisation_id: org.id,
        email: inviteManager.email,
        full_name: `${marker} Invite Manager`,
        role: "practitioner",
        professional_role: "manager",
        token_hash: mgrHash,
        status: "pending",
        invited_by: owner.id,
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      });
    if (mgrInvErr) throw new Error(`manager invite row: ${mgrInvErr.message}`);

    await acceptInvitationInBrowser(
      inviteManager.email,
      mgrToken,
      url => {
        const u = new URL(url);
        return u.pathname === "/" && u.searchParams.get("view") === "dashboard";
      }
    );
    report.invitationManager = "PASS";

    report.overall = "PASS";
  } catch (error) {
    report.overall = "FAIL";
    const message = error instanceof Error ? error.message : String(error);
    const safe = message
      .replace(/password=[^&\s"']+/gi, "password=[REDACTED]")
      .replace(/email=[^&\s"']+/gi, "email=[REDACTED]")
      .slice(0, 500);
    console.error("AUTH RELIABILITY GATE FAILURE:", safe);
    for (const key of Object.keys(report)) {
      if (report[key] == null) report[key] = "FAIL";
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);

    for (const orgId of orgIds) {
      await admin
        .from("organisation_invitations")
        .delete()
        .eq("organisation_id", orgId);
      await admin
        .from("organisation_memberships")
        .delete()
        .eq("organisation_id", orgId);
      await admin
        .from("organisation_audit_log")
        .delete()
        .eq("organisation_id", orgId);
      await admin.from("organisations").delete().eq("id", orgId);
    }
    for (const userId of userIds) {
      await admin.from("platform_owners").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }

    if (server) {
      server.kill("SIGTERM");
    }
  }

  console.log(
    JSON.stringify(
      {
        source: "auth_reliability_gate",
        identityUntouched: true,
        customerInvitesUntouched: true,
        ...report,
      },
      null,
      2
    )
  );

  if (report.overall !== "PASS") process.exit(1);
}

main().catch(error => {
  console.error(
    "AUTH RELIABILITY GATE FAILURE:",
    error instanceof Error ? error.message.slice(0, 500) : String(error)
  );
  process.exit(1);
});
