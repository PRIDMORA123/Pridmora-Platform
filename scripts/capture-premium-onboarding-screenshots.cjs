const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT = path.join(
  process.cwd(),
  "design-references/premium-onboarding"
);
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:3010/dev/premium-onboarding-preview";

async function clickMode(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  const frame = page.locator("[data-preview-frame]");
  await frame.waitFor({ state: "visible" });
  await frame.screenshot({
    path: path.join(OUT, `${name}.png`),
    animations: "disabled",
  });
  console.log("wrote", name);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await desktop.goto(BASE, { waitUntil: "networkidle" });

  await clickMode(desktop, "welcome");
  await shot(desktop, "welcome-desktop");

  await clickMode(desktop, "relationship");
  await shot(desktop, "relationship-desktop");

  await clickMode(desktop, "conversation");
  await shot(desktop, "conversation-desktop");

  await clickMode(desktop, "complete");
  await shot(desktop, "completion-desktop");

  await clickMode(desktop, "empty");
  await shot(desktop, "premium-empty-home");

  await clickMode(desktop, "populated");
  await desktop.waitForTimeout(800);
  await shot(desktop, "populated-home-no-onboarding");

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await clickMode(mobile, "Switch to mobile");
  await clickMode(mobile, "welcome");
  await shot(mobile, "welcome-mobile");

  await browser.close();
  console.log("done", OUT);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
