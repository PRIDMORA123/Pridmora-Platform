/**
 * Capture Averly sample organisation review screenshots via UI install flow.
 *
 * Usage:
 *   set -a && source .env.pilot.local && set +a
 *   APP_URL=http://127.0.0.1:3001 node --experimental-strip-types scripts/capture-averly-screenshots.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shotDir = resolve(
  root,
  "design-references/sample-organisation/averly-screenshots"
);
const runId = `averly-shot-${Date.now().toString(36)}`;
const password = `AverlyShot!${runId.slice(-8)}Aa1`;

function loadPilotEnv() {
  const path = resolve(root, ".env.pilot.local");
  if (!existsSync(path)) throw new Error("Missing .env.pilot.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadPilotEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.APP_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

if (!url || !anonKey || !serviceKey) {
  console.error("Missing Pilot env keys.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const createdUsers = [];
let sourceOrgId = null;
let sampleOrgId = null;
let installationId = null;

async function waitForApp() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${appUrl}/auth/sign-in`);
      if (res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`App not ready at ${appUrl}`);
}

async function createOwner() {
  const email = `averly.shot.owner.${runId}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Averly Screenshot Owner" },
  });
  if (error || !data.user) throw error || new Error("Unable to create owner");
  createdUsers.push(data.user);

  const { data: org, error: orgError } = await admin
    .from("organisations")
    .insert({
      name: `Averly Shot Source ${runId}`,
      slug: `averly-shot-source-${runId}`.slice(0, 48),
      organisation_type: "practice",
      created_by: data.user.id,
      status: "active",
    })
    .select("id")
    .single();
  if (orgError || !org) throw orgError || new Error("Unable to create source org");
  sourceOrgId = org.id;

  await admin.from("organisation_memberships").insert({
    organisation_id: org.id,
    user_id: data.user.id,
    role: "owner",
    professional_role: "manager",
    status: "active",
    joined_at: new Date().toISOString(),
  });

  await admin.from("user_organisation_preferences").upsert({
    user_id: data.user.id,
    current_organisation_id: org.id,
  });

  return { email, user: data.user };
}

async function cookieHeaderFor(email) {
  const cookieJar = new Map();
  const server = createServerClient(url, anonKey, {
    cookies: {
      getAll: () =>
        [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
      setAll: cookies => {
        for (const cookie of cookies) cookieJar.set(cookie.name, cookie.value);
      },
    },
  });
  const { error } = await server.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return [...cookieJar.entries()].map(([name, value]) => ({ name, value }));
}

async function cleanup() {
  if (installationId) {
    try {
      await admin.rpc("cleanup_sample_organisation_installation", {
        p_installation_id: installationId,
        p_delete_organisation: true,
      });
    } catch {
      // best effort
    }
  }
  const { data: leftover } = await admin
    .from("organisations")
    .select("id")
    .or("name.ilike.%Averly Services Group%,name.ilike.%Averly Shot Source%")
    .in(
      "created_by",
      createdUsers.map(u => u.id)
    );
  for (const org of leftover || []) {
    await admin.from("organisation_memberships").delete().eq("organisation_id", org.id);
    await admin.from("sample_organisation_installations").delete().eq("organisation_id", org.id);
    await admin.from("organisations").delete().eq("id", org.id);
  }
  if (sourceOrgId) {
    await admin.from("organisation_memberships").delete().eq("organisation_id", sourceOrgId);
    await admin.from("organisations").delete().eq("id", sourceOrgId);
  }
  for (const user of createdUsers) {
    await admin.auth.admin.deleteUser(user.id);
  }
}

async function shot(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(shotDir, `${name}.png`),
    fullPage: true,
  });
  console.log(`SHOT ${name}.png`);
}

async function main() {
  mkdirSync(shotDir, { recursive: true });
  await waitForApp();
  const owner = await createOwner();
  const browser = await chromium.launch({ headless: true });

  try {
    const cookies = await cookieHeaderFor(owner.email);
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    });
    await context.addCookies(
      cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        url: appUrl,
      }))
    );
    const page = await context.newPage();

    await page.goto(`${appUrl}/settings/sample-organisation`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.getByText("Averly Services Group").first().waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: /Install sample organisation/i }).waitFor({
      timeout: 30000,
    });
    await shot(page, "01-install-screen-laptop-1366");

    await page.setViewportSize({ width: 768, height: 1024 });
    await shot(page, "01b-install-screen-tablet");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, "01c-install-screen-mobile");
    await page.setViewportSize({ width: 1366, height: 768 });

    // Install via UI
    await page.getByRole("button", { name: /Install sample organisation/i }).click();
    await page.getByRole("button", { name: /^Install$/i }).click();
    await page.getByText(/Sample organisation ready|Installed|Open sample organisation/i).first().waitFor({
      timeout: 180000,
    });
    await shot(page, "01d-installed-ready-laptop-1366");

    // Resolve installation id for cleanup
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/sample-organisations");
      return res.json();
    });
    const averly = (status.packs || []).find(p => p.packKey === "averly-services-group");
    installationId = averly?.installation?.id || null;
    sampleOrgId = averly?.installation?.organisationId || null;

    await page.getByRole("button", { name: /Open sample organisation/i }).click();
    await page.waitForURL(u => !u.pathname.includes("/settings/sample-organisation"), {
      timeout: 60000,
    });
    await page.waitForTimeout(2500);
    // Wait until loading splash clears if present
    for (let i = 0; i < 20; i += 1) {
      const opening = await page.getByText("Opening your workspace").count();
      if (!opening) break;
      await page.waitForTimeout(1000);
    }
    await shot(page, "02-manager-home-laptop-1366");

    // Person overview from portfolio card
    const portfolioPerson = page.locator(".relationship-portfolio-item").filter({ hasText: /Sophie|Marcus|Aisha|Ben|Emma/i }).first();
    if (await portfolioPerson.count()) {
      await portfolioPerson.click();
      await page.waitForTimeout(1500);
      await shot(page, "04-person-overview-laptop-1366");

      const sessionLink = page.getByText(/Development conversation|One-to-one|Feedback conversation|Performance conversation|Development review/i).first();
      if (await sessionLink.count()) {
        await sessionLink.click();
        await page.waitForTimeout(1500);
        await shot(page, "07-summary-insights-laptop-1366");
      }

      const intelTab = page.getByRole("link", { name: /Intelligence|Development/i }).first();
      if (await intelTab.count()) {
        await intelTab.click();
        await page.waitForTimeout(1200);
        await shot(page, "08-development-intelligence-laptop-1366");
      }
    }

    // People
    const people = page.getByRole("link", { name: /^People$/i }).first();
    if (await people.count()) {
      await people.click();
    } else {
      await page.goto(`${appUrl}/?view=clients`, { waitUntil: "domcontentloaded" });
    }
    await page.waitForTimeout(1500);
    await shot(page, "03-people-laptop-1366");

    // Prepare
    const prepare = page.getByRole("link", { name: /Prepare|Preparation/i }).first();
    if (await prepare.count()) {
      await prepare.click();
    } else {
      await page.goto(`${appUrl}/?view=prepare`, { waitUntil: "domcontentloaded" });
    }
    await page.waitForTimeout(1500);
    await shot(page, "05-prepare-manager-scenarios-laptop-1366");

    // Conversations
    const conversations = page.getByRole("link", { name: /Conversations/i }).first();
    if (await conversations.count()) {
      await conversations.click();
      await page.waitForTimeout(1500);
      await shot(page, "06-conversations-laptop-1366");
    }

    const development = page.getByRole("link", { name: /^Development$/i }).first();
    if (await development.count()) {
      await development.click();
      await page.waitForTimeout(1500);
      await shot(page, "08-development-intelligence-laptop-1366");
    }

    const myDev = page.getByRole("link", { name: /My development/i }).first();
    if (await myDev.count()) {
      await myDev.click();
    } else {
      await page.goto(`${appUrl}/?view=my-development`, { waitUntil: "domcontentloaded" });
    }
    await page.waitForTimeout(1500);
    await shot(page, "09-my-development-laptop-1366");

    await page.goto(`${appUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.setViewportSize({ width: 768, height: 1024 });
    await shot(page, "10-manager-home-tablet");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, "11-manager-home-mobile");

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${appUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const signOutVisible = await page
      .getByRole("button", { name: /sign out/i })
      .isVisible()
      .catch(() => false);
    await shot(page, "12-home-sign-out-visible-laptop-1366");

    writeFileSync(
      resolve(shotDir, "screenshot-report.json"),
      JSON.stringify(
        {
          shotDir,
          installationId,
          sampleOrgId,
          signOutVisibleAtLaptop1366x768: signOutVisible,
          files: readdirSync(shotDir).filter(name => name.endsWith(".png")),
          capturedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    await context.close();
    console.log(`Screenshots written to ${shotDir}`);
  } finally {
    await browser.close();
    await cleanup();
  }
}

main().catch(async error => {
  console.error(error);
  await cleanup();
  process.exit(1);
});
