const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT = path.join(
  process.cwd(),
  "design-references/manager-platform-iteration"
);
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:3011";

const viewports = [
  { name: "laptop-1366x768", width: 1366, height: 768 },
  { name: "laptop-1440x800", width: 1440, height: 800 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "desktop-1920x1080", width: 1920, height: 1080 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844, isMobile: true },
];

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
  console.log("wrote", name);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const vp of viewports) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      isMobile: Boolean(vp.isMobile),
    });

    await page.goto(`${BASE}/auth/sign-in`, { waitUntil: "networkidle" });
    await shot(page, `sign-in-${vp.name}`);

    await page.goto(`${BASE}/dev/home-preview?scenario=full`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(800);

    if (vp.isMobile || vp.width <= 768) {
      const menu = page.getByRole("button", { name: "Open menu" });
      if (await menu.count()) {
        await menu.click();
        await page.waitForTimeout(400);
      }
    }

    await shot(page, `home-nav-${vp.name}`);

    // Prove Sign out is in the viewport for laptop heights.
    if (vp.height <= 800 && vp.width > 900) {
      const signOut = page.getByRole("button", { name: /Sign out/i });
      const box = await signOut.boundingBox();
      const visible =
        box &&
        box.y >= 0 &&
        box.y + box.height <= vp.height + 1;
      fs.writeFileSync(
        path.join(OUT, `sign-out-visible-${vp.name}.json`),
        JSON.stringify(
          {
            viewport: vp,
            boundingBox: box,
            visibleInViewport: Boolean(visible),
          },
          null,
          2
        )
      );
      console.log(
        "sign-out visibility",
        vp.name,
        Boolean(visible),
        box
      );
    }

    await page.close();
  }

  await browser.close();
  console.log("done", OUT);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
