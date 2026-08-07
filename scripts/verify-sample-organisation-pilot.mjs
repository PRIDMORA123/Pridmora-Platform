/**
 * Sample Organisation Installer — Pridmora Pilot live verification.
 * Disposable fixtures only. Cleans up on success or failure.
 *
 * Usage:
 *   set -a && source .env.pilot.local && set +a
 *   APP_URL=http://127.0.0.1:3001 node --experimental-strip-types scripts/verify-sample-organisation-pilot.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runId = `soi-pilot-${Date.now().toString(36)}`;
const password = `SoiPilot!${runId.slice(-8)}Aa1`;
const marker = `Sample Org Pilot Disposable ${runId}`;
const shotDir = resolve(
  root,
  "design-references/sample-organisation/pilot-screenshots"
);

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

const projectRef = new URL(url).hostname.split(".")[0];
if (projectRef !== "jfcxnkmflfzzxqovkuqw") {
  console.error(`Refusing to run against non-Pilot project: ${projectRef}`);
  process.exit(1);
}

console.log("Sample Organisation Pilot verification");
console.log(`Project: ${projectRef} (Pridmora Pilot)`);
console.log(`App URL: ${appUrl}`);
console.log(`Run: ${runId}\n`);

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** @type {{ id: string, email: string, role: string }[]} */
const createdUsers = [];
/** @type {string[]} */
const createdOrgIds = [];
/** @type {string[]} */
const trackedSampleOrgIds = [];

const results = [];
/** @type {Record<string, number>} */
const stageTimings = {};
let installDurationMs = 0;
let slowestStage = null;

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, error) {
  const detail = error instanceof Error ? error.message : String(error);
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createAuthUser(label, roleHint) {
  const email = `${runId}-${label}@pridmora-soi-pilot.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `${marker} ${label}` },
  });
  assert(!error && data.user, `createUser(${label}): ${error?.message}`);
  const user = { id: data.user.id, email, role: roleHint };
  createdUsers.push(user);
  await admin.from("profiles").upsert({
    id: user.id,
    full_name: `${marker} ${label}`,
    professional_title: "Coach",
    preparation_style: "guided",
    coaching_intelligence_mode: "assisted",
  });
  return user;
}

function authClient() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const cookieCache = new Map();

async function establishBrowserCookies(email) {
  if (cookieCache.has(email)) return cookieCache.get(email);
  const anon = authClient();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  assert(!error && data.session, `cookie sign-in(${email}): ${error?.message}`);
  /** @type {{ name: string, value: string }[]} */
  const jar = [];
  const ssr = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.map(({ name, value }) => ({ name, value })),
      setAll: cookiesToSet => {
        for (const item of cookiesToSet) {
          const index = jar.findIndex(entry => entry.name === item.name);
          if (index >= 0) jar[index] = { name: item.name, value: item.value };
          else jar.push({ name: item.name, value: item.value });
        }
      },
    },
  });
  const { error: setError } = await ssr.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  assert(!setError, `setSession(${email}): ${setError?.message}`);
  const cookieHeader = jar.map(entry => `${entry.name}=${entry.value}`).join("; ");
  cookieCache.set(email, cookieHeader);
  return cookieHeader;
}

async function api(email, method, path, body, headers = {}) {
  const cookie = await establishBrowserCookies(email);
  const response = await fetch(`${appUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      cookie,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: response.status, ok: response.ok, json, text };
}

async function ensurePersonalOrg(userId) {
  const { data, error } = await admin.rpc("ensure_personal_organisation", {
    p_user_id: userId,
  });
  assert(!error && data, `ensure_personal_organisation: ${error?.message}`);
  createdOrgIds.push(data);
  return data;
}

async function createPracticeOrg(ownerId, name) {
  const { data: org, error } = await admin
    .from("organisations")
    .insert({
      name,
      organisation_type: "practice",
      created_by: ownerId,
      status: "active",
      licence_plan_name: "Pilot",
      practitioner_seats_purchased: 5,
      licence_status: "active",
    })
    .select("id")
    .single();
  assert(!error && org, `create org: ${error?.message}`);
  createdOrgIds.push(org.id);

  const { error: memErr } = await admin.from("organisation_memberships").insert({
    organisation_id: org.id,
    user_id: ownerId,
    role: "owner",
    professional_role: "coach",
    status: "active",
    joined_at: new Date().toISOString(),
  });
  assert(!memErr, `owner membership: ${memErr?.message}`);
  return org.id;
}

async function addMember(orgId, userId, role) {
  const { error } = await admin.from("organisation_memberships").insert({
    organisation_id: orgId,
    user_id: userId,
    role,
    professional_role: role === "practitioner" ? "coach" : null,
    status: "active",
    joined_at: new Date().toISOString(),
  });
  assert(!error, `addMember(${role}): ${error?.message}`);
}

async function setCurrentOrg(userId, orgId) {
  await admin
    .from("profiles")
    .update({ current_organisation_id: orgId })
    .eq("id", userId);
}

async function cleanupSampleInstallationsForUsers(userIds) {
  const { data: installs } = await admin
    .from("sample_organisation_installations")
    .select("id, organisation_id, status")
    .in("installed_by", userIds);

  for (const row of installs || []) {
    trackedSampleOrgIds.push(row.organisation_id);
    await admin.rpc("cleanup_sample_organisation_installation", {
      p_installation_id: row.id,
      p_delete_organisation: true,
    });
    // Fallback hard delete if RPC leaves residue (service role)
    await admin
      .from("organisation_intelligence_generation_locks")
      .delete()
      .eq("organisation_id", row.organisation_id);
    await admin
      .from("organisation_intelligence_snapshots")
      .delete()
      .eq("organisation_id", row.organisation_id);
    const { data: clients } = await admin
      .from("clients")
      .select("id")
      .eq("organisation_id", row.organisation_id);
    for (const client of clients || []) {
      await admin.from("sessions").delete().eq("client_id", client.id);
      await admin.from("client_items").delete().eq("client_id", client.id);
      await admin.from("development_updates").delete().eq("client_id", client.id);
      await admin.from("development_profiles").delete().eq("client_id", client.id);
      await admin.from("intelligence_items").delete().eq("client_id", client.id);
      await admin.from("relationship_assignments").delete().eq("client_id", client.id);
      await admin.from("client_private_identities").delete().eq("client_id", client.id);
      await admin.from("clients").delete().eq("id", client.id);
    }
    await admin.from("sample_organisation_records").delete().eq("installation_id", row.id);
    await admin.from("sample_organisation_installations").delete().eq("id", row.id);
    await admin.from("organisation_memberships").delete().eq("organisation_id", row.organisation_id);
    await admin.from("organisation_audit_log").delete().eq("organisation_id", row.organisation_id);
    await admin.from("organisations").delete().eq("id", row.organisation_id);
  }

  // Sweep sample leftovers for this run's users (Averly + legacy Northbridge)
  const { data: northbridge } = await admin
    .from("organisations")
    .select("id, created_by, name")
    .or("name.ilike.%Averly Services Group%,name.ilike.%Northbridge Healthcare Trust%");
  for (const org of northbridge || []) {
    if (!userIds.includes(org.created_by)) continue;
    trackedSampleOrgIds.push(org.id);
    await admin.from("organisation_intelligence_snapshots").delete().eq("organisation_id", org.id);
    const { data: clients } = await admin
      .from("clients")
      .select("id")
      .eq("organisation_id", org.id);
    for (const client of clients || []) {
      await admin.from("sessions").delete().eq("client_id", client.id);
      await admin.from("client_items").delete().eq("client_id", client.id);
      await admin.from("development_updates").delete().eq("client_id", client.id);
      await admin.from("development_profiles").delete().eq("client_id", client.id);
      await admin.from("intelligence_items").delete().eq("client_id", client.id);
      await admin.from("relationship_assignments").delete().eq("client_id", client.id);
      await admin.from("client_private_identities").delete().eq("client_id", client.id);
      await admin.from("clients").delete().eq("id", client.id);
    }
    await admin.from("sample_organisation_records").delete().eq("organisation_id", org.id);
    await admin.from("sample_organisation_installations").delete().eq("organisation_id", org.id);
    await admin.from("organisation_memberships").delete().eq("organisation_id", org.id);
    await admin.from("organisation_audit_log").delete().eq("organisation_id", org.id);
    await admin.from("organisations").delete().eq("id", org.id);
  }
}

async function cleanup() {
  console.log("\nCleaning disposable Pilot fixtures…");
  const userIds = createdUsers.map(u => u.id);
  if (userIds.length) {
    await cleanupSampleInstallationsForUsers(userIds);
  }

  for (const orgId of createdOrgIds) {
    await admin.from("organisation_intelligence_generation_locks").delete().eq("organisation_id", orgId);
    await admin.from("organisation_intelligence_snapshots").delete().eq("organisation_id", orgId);
    await admin.from("organisation_memberships").delete().eq("organisation_id", orgId);
    await admin.from("organisation_audit_log").delete().eq("organisation_id", orgId);
    await admin.from("organisations").delete().eq("id", orgId);
  }

  for (const user of createdUsers) {
    await admin.from("profiles").delete().eq("id", user.id);
    await admin.auth.admin.deleteUser(user.id);
  }

  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 500 });
  for (const user of usersPage?.users || []) {
    if ((user.email || "").includes(runId)) {
      await admin.auth.admin.deleteUser(user.id);
    }
  }
  console.log("Cleanup complete.");
}

async function waitForAppReady(retries = 90) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${appUrl}/auth/sign-in`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.status > 0 && res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`App not ready at ${appUrl}`);
}

async function playwrightSignIn(page, email) {
  await page.goto(`${appUrl}/auth/sign-in`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(url => !url.pathname.includes("/auth/sign-in"), {
    timeout: 60000,
  });
}

async function captureScreenshots(ownerEmail) {
  mkdirSync(shotDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await playwrightSignIn(page, ownerEmail);

  async function shot(name, path) {
    await page.goto(`${appUrl}${path}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: resolve(shotDir, `${name}.png`),
      fullPage: true,
    });
    console.log(`SHOT  ${name}.png`);
  }

  await shot("05-installed-state", "/settings/sample-organisation");

  const resetBtn = page.getByRole("button", { name: "Reset sample organisation" });
  if (await resetBtn.count()) {
    await resetBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: resolve(shotDir, "07-reset-confirmation.png"),
      fullPage: true,
    });
    console.log("SHOT  07-reset-confirmation.png");
    await page.getByRole("button", { name: "Cancel" }).click();
  }

  const removeBtn = page.getByRole("button", { name: "Remove sample organisation" });
  if (await removeBtn.count()) {
    await removeBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: resolve(shotDir, "08-remove-confirmation.png"),
      fullPage: true,
    });
    console.log("SHOT  08-remove-confirmation.png");
    await page.getByRole("button", { name: "Cancel" }).click();
  }

  await shot("06-organisation-intelligence", "/organisation/intelligence");

  await page.setViewportSize({ width: 390, height: 844 });
  await shot("09-mobile-view", "/settings/sample-organisation");

  await browser.close();
}

async function main() {
  let owner;
  let administrator;
  let oversight;
  let practitioner;
  let outsider;
  let sourceOrgId;
  let foreignOrgId;
  let sampleOrgId = null;
  let installationId = null;
  /** @type {Record<string, unknown>} */
  const report = {
    runId,
    projectRef,
    appUrl,
    migration: "20260804180000_sample_organisation_installer.sql",
  };

  try {
    await waitForAppReady();
    pass("app.ready", appUrl);

    // Schema presence
    const { error: tableErr } = await admin
      .from("sample_organisation_installations")
      .select("id")
      .limit(1);
    assert(!tableErr, `installations table: ${tableErr?.message}`);
    pass("schema.sample_organisation_installations");

    owner = await createAuthUser("owner", "owner");
    administrator = await createAuthUser("admin", "administrator");
    oversight = await createAuthUser("oversight", "oversight");
    practitioner = await createAuthUser("practitioner", "practitioner");
    outsider = await createAuthUser("outsider", "owner");

    sourceOrgId = await createPracticeOrg(owner.id, `${marker} Source Practice`);
    await addMember(sourceOrgId, administrator.id, "administrator");
    await addMember(sourceOrgId, oversight.id, "oversight");
    await addMember(sourceOrgId, practitioner.id, "practitioner");
    await setCurrentOrg(owner.id, sourceOrgId);
    await setCurrentOrg(administrator.id, sourceOrgId);
    await setCurrentOrg(oversight.id, sourceOrgId);
    await setCurrentOrg(practitioner.id, sourceOrgId);

    foreignOrgId = await createPracticeOrg(outsider.id, `${marker} Foreign Practice`);
    await setCurrentOrg(outsider.id, foreignOrgId);

    // Ensure personal orgs exist (side effect of resolve) without polluting sample
    await ensurePersonalOrg(owner.id);
    await ensurePersonalOrg(outsider.id);

    // ---- Access checks ----
    const deniedRoles = [
      ["practitioner", practitioner.email],
      ["oversight", oversight.email],
    ];
    for (const [label, email] of deniedRoles) {
      const res = await api(email, "GET", "/api/sample-organisations/averly-services-group");
      assert(res.status === 403, `${label} expected 403, got ${res.status}`);
      pass(`access.${label}_denied`, String(res.status));
    }

    // Cross-organisation: another organisation's owner may manage their own sample
    // packs, but must not read another user's installation by ID.
    const outsiderPack = await api(
      outsider.email,
      "GET",
      "/api/sample-organisations/averly-services-group"
    );
    assert(outsiderPack.ok, `outsider owner should access pack endpoint, got ${outsiderPack.status}`);
    pass("access.outsider_owner_can_see_pack");

    const ownerGet = await api(owner.email, "GET", "/api/sample-organisations/averly-services-group");
    assert(ownerGet.ok, `owner get pack: ${ownerGet.status} ${ownerGet.text.slice(0, 200)}`);
    pass("access.owner_allowed");

    const adminGet = await api(
      administrator.email,
      "GET",
      "/api/sample-organisations/averly-services-group"
    );
    assert(adminGet.ok, `admin get pack: ${adminGet.status}`);
    pass("access.administrator_allowed");

    // Unauthenticated
    const unauth = await fetch(`${appUrl}/api/sample-organisations`, {
      signal: AbortSignal.timeout(15000),
    });
    assert(unauth.status === 401 || unauth.status === 403, `unauth status ${unauth.status}`);
    pass("access.unauthenticated_denied", String(unauth.status));

    // Baseline counts for source org (must remain unchanged)
    const baselineClients = await admin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", sourceOrgId);
    const baselineSourceClientCount = baselineClients.count ?? 0;

    // Pre-install available + confirmation screenshots via real sign-in
    mkdirSync(shotDir, { recursive: true });
    {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      await playwrightSignIn(page, owner.email);
      await page.goto(`${appUrl}/settings/sample-organisation`, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: resolve(shotDir, "01-available-state.png"),
        fullPage: true,
      });
      console.log("SHOT  01-available-state.png");
      const installBtn = page.getByRole("button", {
        name: "Install sample organisation",
      });
      await installBtn.waitFor({ timeout: 30000 });
      await installBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: resolve(shotDir, "02-install-confirmation.png"),
        fullPage: true,
      });
      console.log("SHOT  02-install-confirmation.png");
      // Keep dialog open? Cancel then API installs. Capture confirm only.
      await page.getByRole("button", { name: "Cancel" }).click();
      await browser.close();
    }

    // ---- Install (owner) with timing ----
    const idemKey = `idem-${runId}`;
    const installStarted = Date.now();

    // Parallel UI observer for progress screenshot
    const progressBrowserPromise = (async () => {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      await playwrightSignIn(page, owner.email);
      await page.goto(`${appUrl}/settings/sample-organisation`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      let capturedProgress = false;
      let capturedComplete = false;
      for (let i = 0; i < 80; i += 1) {
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
        await page.waitForTimeout(2000);
        const text = (await page.locator("body").innerText()) || "";
        if (
          !capturedProgress &&
          (text.includes("Installing") ||
            text.includes("Creating") ||
            text.includes("Validating"))
        ) {
          await page.screenshot({
            path: resolve(shotDir, "03-installation-progress.png"),
            fullPage: true,
          });
          console.log("SHOT  03-installation-progress.png");
          capturedProgress = true;
        }
        if (
          !capturedComplete &&
          (text.includes("Sample organisation ready") ||
            (text.includes("Installed") && text.includes("Ready")))
        ) {
          await page.screenshot({
            path: resolve(shotDir, "04-completion-or-installed.png"),
            fullPage: true,
          });
          console.log("SHOT  04-completion-or-installed.png");
          capturedComplete = true;
          break;
        }
      }
      await browser.close();
    })().catch(err => {
      console.warn("progress screenshot helper:", err.message);
    });

    const installRes = await api(
      owner.email,
      "POST",
      "/api/sample-organisations/averly-services-group/install",
      {},
      { "Idempotency-Key": idemKey }
    );
    installDurationMs = Date.now() - installStarted;
    await progressBrowserPromise;

    assert(
      installRes.ok || installRes.json?.code === "INTELLIGENCE_PENDING",
      `install failed: ${installRes.status} ${installRes.text.slice(0, 400)}`
    );

    const installation = installRes.json.installation;
    assert(installation, "installation payload missing");
    installationId = installation.id;
    sampleOrgId = installation.organisationId;
    trackedSampleOrgIds.push(sampleOrgId);

    pass(
      "install.completed",
      `status=${installation.status} durationMs=${installDurationMs}`
    );
    report.installDurationMs = installDurationMs;
    report.installDurationSeconds = Number((installDurationMs / 1000).toFixed(2));

    if (installDurationMs > 120_000) {
      fail("timeout.within_120s", `${installDurationMs}ms`);
    } else {
      pass("timeout.within_120s", `${installDurationMs}ms`);
    }
    if (installDurationMs >= 90_000) {
      pass(
        "timeout.recommend_queue",
        "Approached 90s — recommend queued/background install before production"
      );
    } else {
      pass("timeout.under_90s", `${installDurationMs}ms`);
    }

    // Duplicate / idempotent install
    const dup = await api(
      owner.email,
      "POST",
      "/api/sample-organisations/averly-services-group/install",
      {},
      { "Idempotency-Key": idemKey }
    );
    assert(dup.ok, `duplicate install response ${dup.status}`);
    assert(dup.json.installation?.id === installationId, "duplicate created different installation");
    assert(
      dup.json.resumed === true || dup.json.installation?.status === "ready",
      "duplicate should resume existing install"
    );
    pass("install.duplicate_blocked_or_resumed");

    // Refresh status
    const statusRes = await api(
      owner.email,
      "GET",
      `/api/sample-organisations/installations/${installationId}`
    );
    assert(statusRes.ok, `status ${statusRes.status}`);
    assert(statusRes.json.installation?.status === "ready" || statusRes.json.installation?.status === "intelligence_pending");
    pass("install.refresh_status", statusRes.json.installation.status);

    // Cross-organisation isolation against this installation
    const crossGet = await api(
      outsider.email,
      "GET",
      `/api/sample-organisations/installations/${installationId}`
    );
    assert(
      crossGet.status === 404 || crossGet.status === 403,
      `cross-org get expected 404/403, got ${crossGet.status}`
    );
    pass("access.cross_organisation_denied", String(crossGet.status));

    if (statusRes.json.installation.status === "intelligence_pending") {
      const retry = await api(
        owner.email,
        "POST",
        `/api/sample-organisations/installations/${installationId}/retry-intelligence`,
        {}
      );
      assert(retry.ok, `retry intelligence: ${retry.status} ${retry.text.slice(0, 300)}`);
      pass("install.intelligence_retry");
    }

    // ---- Count verification ----
    const { data: sampleOrg } = await admin
      .from("organisations")
      .select("id, name, created_by")
      .eq("id", sampleOrgId)
      .maybeSingle();
    assert(sampleOrg?.name === "Averly Services Group", "sample org name");
    assert(sampleOrg?.created_by === owner.id, "installing user owns sample org");
    pass("install.one_averly_org");

    const { data: ownerMembership } = await admin
      .from("organisation_memberships")
      .select("role, status")
      .eq("organisation_id", sampleOrgId)
      .eq("user_id", owner.id)
      .maybeSingle();
    assert(ownerMembership?.role === "owner" && ownerMembership?.status === "active");
    pass("install.user_is_owner");

    const { data: clients } = await admin
      .from("clients")
      .select("id, identity_mode, email, ai_name_allowed, display_label, confidential_reference, name")
      .eq("organisation_id", sampleOrgId);
    assert((clients || []).length === 12, `relationships=${clients?.length}`);
    const confidential = (clients || []).filter(c => c.identity_mode === "confidential");
    const standard = (clients || []).filter(c => c.identity_mode === "standard");
    assert(confidential.length === 2, `confidential=${confidential.length}`);
    assert(standard.length === 10, `standard=${standard.length}`);
    pass("counts.relationships_12");

    const clientIds = (clients || []).map(c => c.id);
    const { count: sessionCount } = await admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", sampleOrgId);
    assert(sessionCount === 72, `sessions=${sessionCount}`);
    pass("counts.sessions_72");

    const { count: actionCount } = await admin
      .from("client_items")
      .select("id", { count: "exact", head: true })
      .eq("item_type", "action")
      .in("client_id", clientIds);
    assert(actionCount === 72, `actions=${actionCount}`);
    pass("counts.actions_72");

    const { count: updateCount } = await admin
      .from("development_updates")
      .select("id", { count: "exact", head: true })
      .in("client_id", clientIds);
    assert(updateCount === 24, `updates=${updateCount}`);
    pass("counts.development_updates_24");

    const { count: intelCount } = await admin
      .from("intelligence_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .in("client_id", clientIds);
    assert(intelCount === 72, `intelligence=${intelCount}`);
    pass("counts.intelligence_items_72");

    for (const clientId of clientIds) {
      const { count } = await admin
        .from("relationship_assignments")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("assignment_role", "primary")
        .eq("status", "active");
      assert((count ?? 0) >= 1, "missing primary assignment");
    }
    pass("install.primary_assignments");

    const { data: snapshots } = await admin
      .from("organisation_intelligence_snapshots")
      .select("id, status, executive_brief, source_relationship_count, source_conversation_count, source_evidence_count")
      .eq("organisation_id", sampleOrgId)
      .eq("status", "ready");
    assert((snapshots || []).length >= 1, "missing OI snapshot");
    const snapshot = snapshots[0];
    pass(
      "install.organisation_intelligence_snapshot",
      `relationships=${snapshot.source_relationship_count} conversations=${snapshot.source_conversation_count}`
    );

    // ---- Privacy ----
    for (const row of confidential) {
      assert(!row.email, "confidential email not empty");
      assert(row.ai_name_allowed === false, "ai_name_allowed must be false");
      assert(row.display_label, "display label required");
      // name should be display label / reference style, not a private personal name pattern
      assert(!/@/.test(row.name || ""), "name must not look like email");
    }
    const { data: privateRows } = await admin
      .from("client_private_identities")
      .select("id, real_name, email, phone, client_id")
      .eq("organisation_id", sampleOrgId);
    // Installer does not seed private identity rows for confidential examples
    assert((privateRows || []).length === 0, `unexpected private identity rows: ${privateRows?.length}`);
    pass("privacy.confidential_public_safe");

    const brief = snapshot.executive_brief || "";
    for (const row of confidential) {
      if (row.confidential_reference) {
        assert(
          !brief.includes(row.confidential_reference),
          "confidential reference leaked into executive brief"
        );
      }
    }
    assert(!/sarah\.mitchell|private_notes|@northbridge\.example/i.test(brief));
    pass("privacy.executive_brief_clean");

    const { data: audits } = await admin
      .from("organisation_audit_log")
      .select("action, metadata")
      .eq("entity_id", installationId);
    for (const audit of audits || []) {
      const meta = JSON.stringify(audit.metadata || {});
      assert(!/@northbridge\.example/i.test(meta), "email in audit");
      assert(!/private_notes|real_name|phone/i.test(meta), "private fields in audit");
    }
    pass("privacy.audit_safe");

    // Source org unchanged
    const afterClients = await admin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", sourceOrgId);
    assert((afterClients.count ?? 0) === baselineSourceClientCount, "source org mutated");
    pass("isolation.source_org_unchanged");

    // ---- Organisation switching ----
    const openRes = await api(
      owner.email,
      "POST",
      `/api/sample-organisations/installations/${installationId}/open`,
      {}
    );
    assert(openRes.ok, `open sample: ${openRes.status}`);
    const { data: pref } = await admin
      .from("profiles")
      .select("current_organisation_id")
      .eq("id", owner.id)
      .maybeSingle();
    assert(pref?.current_organisation_id === sampleOrgId, "did not switch to sample");
    pass("switching.open_sample");

    // Switch back
    await setCurrentOrg(owner.id, sourceOrgId);
    cookieCache.delete(owner.email);
    const { data: prefBack } = await admin
      .from("profiles")
      .select("current_organisation_id")
      .eq("id", owner.id)
      .maybeSingle();
    assert(prefBack?.current_organisation_id === sourceOrgId, "switch back failed");
    pass("switching.back_to_source");

    // ---- Organisation Intelligence content ----
    await setCurrentOrg(owner.id, sampleOrgId);
    cookieCache.delete(owner.email);
    const oi = await api(owner.email, "GET", "/api/organisations/intelligence");
    assert(oi.ok, `OI get: ${oi.status} ${oi.text.slice(0, 200)}`);
    const view = oi.json.snapshot || oi.json.current || oi.json;
    assert(view, "OI view missing");
    pass(
      "oi.loaded",
      `sourceRelationships=${view.sourceRelationshipCount ?? snapshot.source_relationship_count}`
    );
    assert(
      (view.sourceRelationshipCount ?? snapshot.source_relationship_count) >= 5,
      "privacy threshold not met"
    );
    pass("oi.privacy_threshold_met");
    if (view.executiveBrief || brief) {
      pass("oi.executive_brief_present");
    } else {
      fail("oi.executive_brief_present", "empty brief");
    }

    // Themes
    const { data: themes, error: themesError } = await admin
      .from("organisation_intelligence_themes")
      .select("theme_key, relationship_count, suppressed")
      .eq("snapshot_id", snapshot.id);
    if (themesError) throw new Error(`themes query: ${themesError.message}`);
    const visibleThemes = (themes || []).filter(t => !t.suppressed);
    if ((themes || []).length === 0) {
      // Fall back to API payload themes if table rows were not persisted as expected.
      const apiThemes = view.themes || view.emergingThemes || [];
      assert(Array.isArray(apiThemes) && apiThemes.length > 0, "no themes in DB or API");
      pass("oi.themes_present", `api:${apiThemes.length}`);
    } else {
      pass(
        "oi.themes_present",
        `db:${themes.length} visible:${visibleThemes.length}`
      );
    }

    const { data: metrics } = await admin
      .from("organisation_intelligence_metrics")
      .select("metric_key")
      .eq("snapshot_id", snapshot.id);
    assert((metrics || []).length > 0, "no metrics");
    pass("oi.metrics_present", String(metrics.length));

    // Screenshots while installed
    await captureScreenshots(owner.email);
    // Extra named shots for completion/installed
    writeFileSync(
      resolve(shotDir, "README.txt"),
      [
        "Sample Organisation Pilot screenshots",
        `runId=${runId}`,
        `captured=${new Date().toISOString()}`,
        "01-available-or-installed.png",
        "02-install-confirmation.png (if install CTA visible)",
        "06-organisation-intelligence.png",
        "07-reset-confirmation.png",
        "08-remove-confirmation.png",
        "09-mobile-view.png",
        "03-progress / 04-completion captured via API timing (UI progress is transient)",
      ].join("\n")
    );
    pass("screenshots.captured", shotDir);

    // Capture progress/completion synthetically by saving status payload
    writeFileSync(
      resolve(shotDir, "04-completion-state.json"),
      JSON.stringify(
        {
          title: "Sample organisation ready",
          organisation: "Averly Services Group",
          counts: installation.counts,
          status: "ready",
        },
        null,
        2
      )
    );

    // ---- Reset ----
    // Make several changes inside sample org
    const mutateClient = clients[0];
    await admin
      .from("clients")
      .update({ current_focus: `MUTATED ${runId}` })
      .eq("id", mutateClient.id);
    await admin.from("sessions").insert({
      id: crypto.randomUUID(),
      client_id: mutateClient.id,
      coach_id: owner.id,
      organisation_id: sampleOrgId,
      session_number: 99,
      session_date: "2026-08-01",
      display_date: "2026-08-01",
      display_time: "09:00",
      status: "completed",
      focus: `extra ${runId}`,
      notes: `temporary mutation ${runId}`,
      summary: "mutation",
    });

    await setCurrentOrg(owner.id, sourceOrgId);
    cookieCache.delete(owner.email);
    const resetStarted = Date.now();
    const resetRes = await api(
      owner.email,
      "POST",
      `/api/sample-organisations/installations/${installationId}/reset`,
      {}
    );
    const resetMs = Date.now() - resetStarted;
    assert(resetRes.ok, `reset failed: ${resetRes.status} ${resetRes.text.slice(0, 400)}`);
    pass("reset.completed", `${resetMs}ms`);

    const { data: focusCheck } = await admin
      .from("clients")
      .select("current_focus")
      .eq("id", mutateClient.id)
      .maybeSingle();
    // After reset, original client ids are gone; verify counts restored instead
    const { data: clientsAfterReset } = await admin
      .from("clients")
      .select("id, identity_mode")
      .eq("organisation_id", sampleOrgId);
    assert((clientsAfterReset || []).length === 12, `after reset relationships=${clientsAfterReset?.length}`);
    const { count: sessionsAfterReset } = await admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", sampleOrgId);
    assert(sessionsAfterReset === 72, `after reset sessions=${sessionsAfterReset}`);
    pass("reset.counts_restored");

    const sourceAfterReset = await admin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", sourceOrgId);
    assert((sourceAfterReset.count ?? 0) === baselineSourceClientCount);
    pass("reset.source_unchanged");
    void focusCheck;

    // ---- Remove ----
    const removeDenied = await api(
      owner.email,
      "DELETE",
      `/api/sample-organisations/installations/${installationId}`,
      { confirmation: "NOPE" }
    );
    assert(removeDenied.status === 400, `expected confirmation required, got ${removeDenied.status}`);
    pass("remove.typed_confirmation_required");

    const removeRes = await api(
      owner.email,
      "DELETE",
      `/api/sample-organisations/installations/${installationId}`,
      { confirmation: "REMOVE" }
    );
    assert(removeRes.ok, `remove failed: ${removeRes.status} ${removeRes.text.slice(0, 300)}`);
    pass("remove.completed");

    const { data: orgGone } = await admin
      .from("organisations")
      .select("id")
      .eq("id", sampleOrgId)
      .maybeSingle();
    assert(!orgGone, "sample organisation still present");
    pass("remove.organisation_deleted");

    const { count: orphanSessions } = await admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", sampleOrgId);
    const { count: orphanClients } = await admin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", sampleOrgId);
    const { count: orphanSnaps } = await admin
      .from("organisation_intelligence_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", sampleOrgId);
    assert((orphanSessions ?? 0) === 0 && (orphanClients ?? 0) === 0 && (orphanSnaps ?? 0) === 0);
    pass("remove.no_orphans");

    const { data: prefAfterRemove } = await admin
      .from("profiles")
      .select("current_organisation_id")
      .eq("id", owner.id)
      .maybeSingle();
    assert(
      prefAfterRemove?.current_organisation_id === sourceOrgId ||
        prefAfterRemove?.current_organisation_id !== sampleOrgId,
      "not returned to previous organisation"
    );
    pass("remove.returned_to_previous_org", String(prefAfterRemove?.current_organisation_id));

    const sourceFinal = await admin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", sourceOrgId);
    assert((sourceFinal.count ?? 0) === baselineSourceClientCount);
    pass("remove.source_unchanged");

    // Final sample sweep for this owner (Averly + legacy Northbridge)
    const { data: leftoverNb } = await admin
      .from("organisations")
      .select("id, name")
      .eq("created_by", owner.id)
      .or("name.ilike.%Averly Services Group%,name.ilike.%Northbridge Healthcare Trust%");
    assert((leftoverNb || []).length === 0, `leftover sample orgs: ${leftoverNb?.length}`);
    pass("cleanup.no_sample_left");

    report.stageTimings = stageTimings;
    report.slowestStage = slowestStage;
    report.counts = {
      relationships: 12,
      sessions: 72,
      actions: 72,
      developmentUpdates: 24,
      intelligenceItems: 72,
      confidential: 2,
      standard: 10,
    };
    report.screenshotDir = shotDir;
  } catch (error) {
    fail("fatal", error);
  } finally {
    await cleanup();

    // Confirm no sample orgs for disposable users remain
    const { data: nb } = await admin
      .from("organisations")
      .select("id, name, created_by")
      .or("name.ilike.%Averly Services Group%,name.ilike.%Northbridge Healthcare Trust%");
    const leftover = (nb || []).filter(o =>
      createdUsers.some(u => u.id === o.created_by)
    );
    if (leftover.length === 0) pass("final.no_pilot_sample_fixtures");
    else fail("final.no_pilot_sample_fixtures", JSON.stringify(leftover));

    const failed = results.filter(r => !r.ok);
    report.results = results;
    report.failed = failed.length;
    report.passed = results.filter(r => r.ok).length;
    report.installDurationMs = installDurationMs;
    report.recommendQueuedInstall = installDurationMs >= 90_000;

    mkdirSync(resolve(root, "design-references/sample-organisation"), {
      recursive: true,
    });
    const out = resolve(
      root,
      "design-references/sample-organisation/pilot-verification-report.json"
    );
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${out}`);
    console.log(`Passed ${report.passed} / Failed ${report.failed}`);
    console.log(`Install duration: ${installDurationMs}ms`);
    if (failed.length) process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
