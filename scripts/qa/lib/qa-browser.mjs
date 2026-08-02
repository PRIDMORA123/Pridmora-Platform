/**
 * Playwright browser checks for multi-client reliability.
 * Captures screenshots; never logs confidential narrative.
 */
import { chromium } from "playwright";
import { resolve } from "node:path";
import { assertNoUnexpectedClientNames } from "./qa-isolation.mjs";

function browserError(code, cause) {
  const error = new Error(code);
  error.code = code;
  error.stage = "browser";
  if (cause?.message) {
    error.safeDetails = {
      causeCode: cause.name || null,
      causeMessage: String(cause.message).slice(0, 160),
    };
  }
  return error;
}

async function signIn(page, appUrl, email, password) {
  await page.goto(`${appUrl}/auth/sign-in`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page
    .locator('input[type="email"], input[name="email"]')
    .first()
    .fill(email);
  await page
    .locator('input[type="password"], input[name="password"]')
    .first()
    .fill(password);

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
    .getByRole("button", { name: /New person|People|Sign out|Open menu/i })
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });

  const boot = page.getByText(/Opening your workspace/i);
  if ((await boot.count()) > 0) {
    await boot
      .first()
      .waitFor({ state: "hidden", timeout: 60_000 })
      .catch(() => {});
  }
}

async function ensureMobileNavOpen(page, viewportName) {
  if (viewportName !== "mobile") return;
  const openMenu = page.getByRole("button", { name: /Open menu/i });
  if ((await openMenu.count()) > 0 && (await openMenu.first().isVisible())) {
    await openMenu.first().click({ force: true });
    await page.waitForTimeout(300);
  }
}

async function openPeople(page, viewportName = "desktop") {
  await ensureMobileNavOpen(page, viewportName);
  const people = page.getByRole("button", { name: /^People$/i }).first();
  await people.waitFor({ state: "attached", timeout: 30_000 });
  await people.scrollIntoViewIfNeeded().catch(() => {});
  await people.click({ force: true });
  await page.waitForTimeout(800);
  await page
    .getByRole("heading", { name: /^People$/i })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => {});
}

async function openRelationship(page, displayName, viewportName = "desktop") {
  await openPeople(page, viewportName);

  const named = page.getByText(displayName, { exact: false }).first();
  await named.waitFor({ state: "visible", timeout: 30_000 });
  await named.scrollIntoViewIfNeeded().catch(() => {});
  await named.click({ force: true });

  const canvas = page.locator(".relationship-canvas, .relationship-workspace");
  try {
    await canvas.first().waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    const viewRelationship = page.getByRole("button", {
      name: /View relationship/i,
    });
    if ((await viewRelationship.count()) > 0) {
      await viewRelationship.first().click({ force: true });
    }
    await canvas.first().waitFor({ state: "visible", timeout: 30_000 });
  }
}

async function assertNoErrorOverlay(page) {
  const overlay = page.locator("nextjs-portal, [data-nextjs-dialog]");
  if ((await overlay.count()) > 0 && (await overlay.first().isVisible())) {
    throw browserError("QA_BROWSER_ERROR_OVERLAY");
  }
}

async function capture(page, context, name) {
  const path = resolve(context.trace.runDir, "screenshots", `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

function visibleHeadings(page) {
  return page.locator("h1, h2, h3").allTextContents();
}

export async function runBrowserChecks(context) {
  if (
    context.options.mode === "scale" &&
    process.env.QA_BROWSER_IN_SCALE !== "true"
  ) {
    context.trace.setPhase("browser", true, { skipped: "scale_default" });
    return { skipped: true };
  }

  const coach = context.coaches[0];
  const clients = context.clients
    .filter(c => c.coachId === coach.coachId)
    .slice(0, 3);
  if (!clients.length) {
    throw browserError("QA_BROWSER_NO_CLIENTS");
  }

  const browser = await chromium.launch({ headless: true });
  const results = { viewports: [], clientsChecked: 0 };

  try {
    for (const viewport of [
      { width: 1440, height: 900, name: "desktop" },
      { width: 390, height: 844, name: "mobile" },
    ]) {
      const page = await browser.newPage({ viewport });
      try {
        await signIn(page, context.appUrl, coach.email, coach.password);
        await assertNoErrorOverlay(page);

        await openPeople(page, viewport.name);
        await page.waitForTimeout(1000);
        await capture(page, context, `people-${viewport.name}`);

        for (const client of clients) {
          const matches = page.getByText(client.displayName, {
            exact: false,
          });
          await matches
            .first()
            .waitFor({ state: "visible", timeout: 30_000 })
            .catch(() => {});
          const count = await matches.count();
          if (count < 1) {
            await capture(
              page,
              context,
              `missing-${client.fingerprint}-${viewport.name}`
            );
            throw browserError("QA_BROWSER_CLIENT_MISSING", {
              message: `${client.clientId}:${viewport.name}`,
            });
          }
        }

        const primary = clients[0];
        await openRelationship(page, primary.displayName, viewport.name);
        await capture(page, context, `canvas-${viewport.name}`);

        const bodyText = await page.locator("body").innerText();
        assertNoUnexpectedClientNames(bodyText, primary, context.clients);

        for (const label of [
          { name: /Prepare/i, shot: "prepare" },
          { name: /Session Notes|Notes/i, shot: "notes" },
          {
            name: /Summary & Insights|Pridmora Intelligence/i,
            shot: "summary",
          },
          { name: /Development|Next Focus/i, shot: "development" },
        ]) {
          const control = page.getByRole("button", { name: label.name }).first();
          if ((await control.count()) > 0) {
            await control.scrollIntoViewIfNeeded().catch(() => {});
            await control.click({ force: true }).catch(() => {});
            await page.waitForTimeout(500);
            await assertNoErrorOverlay(page);
            if (viewport.name === "desktop") {
              await capture(
                page,
                context,
                `${label.shot}-${primary.fingerprint}`
              );
            }
          }
        }

        await page.reload({ waitUntil: "domcontentloaded" });
        await page
          .getByRole("button", {
            name: /New person|People|Sign out|Open menu/i,
          })
          .first()
          .waitFor({ state: "visible", timeout: 60_000 });
        await page.waitForTimeout(800);

        const headings = await visibleHeadings(page);
        const joined = headings.join(" | ");
        if (
          joined &&
          !joined
            .toLowerCase()
            .includes(primary.displayName.split(" ")[0].toLowerCase())
        ) {
          await openRelationship(page, primary.displayName, viewport.name);
        }

        const after = await page.locator("body").innerText();
        assertNoUnexpectedClientNames(after, primary, context.clients);

        results.viewports.push(viewport.name);
        results.clientsChecked += 1;
      } catch (error) {
        await capture(page, context, `failure-${viewport.name}`).catch(() => {});
        if (!error.stage) {
          throw browserError(error.code || "QA_BROWSER_FLOW", error);
        }
        throw error;
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }

  context.trace.setPhase("browser", true);
  return results;
}

export async function captureFailureScreenshot(context, error) {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const coach = context.coaches[0];
    if (coach) {
      await signIn(page, context.appUrl, coach.email, coach.password).catch(
        () => {}
      );
    } else {
      await page
        .goto(context.appUrl, { waitUntil: "domcontentloaded" })
        .catch(() => {});
    }
    const path = resolve(
      context.trace.runDir,
      "screenshots",
      `failure-${Date.now()}.png`
    );
    await page.screenshot({ path, fullPage: true }).catch(() => {});
    const url = page.url();
    const headings = await visibleHeadings(page).catch(() => []);
    await browser.close();
    return {
      screenshot: path,
      url,
      headings: headings.slice(0, 12),
      code: error?.code || null,
    };
  } catch {
    return null;
  }
}
