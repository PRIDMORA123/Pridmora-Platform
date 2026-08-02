/**
 * Manual viewport matrix for the Preparation Approach drawer shell.
 * Validates the three-region layout and independent content scrolling.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const designSystemCss = readFileSync(
  resolve("app/identity-design-system.css"),
  "utf8"
);
const globalsCss = readFileSync(resolve("app/globals.css"), "utf8");

const optionCssMatch = globalsCss.match(
  /\.preparation-approach-options[\s\S]*?\.preparation-approach-option p \{[\s\S]*?\}/
);
const optionCss = optionCssMatch?.[0] ?? "";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --identity-white: #ffffff;
        --identity-border-light: #e4eaee;
        --identity-border-medium: #cdd5da;
        --identity-surface-muted: #f8fafb;
        --identity-teal-50: #eef8f6;
        --identity-teal-600: #1f8a7a;
        --identity-navy-800: #123d62;
        --identity-navy-950: #082744;
        --identity-text-secondary: #5b6b78;
        --identity-radius-md: 12px;
      }
      body { margin: 0; font-family: Georgia, serif; }
      .identity-section-title { margin: 0; font-size: 1.2rem; }
      .identity-button { min-height: 44px; padding: 0 14px; border: 1px solid #cdd5da; border-radius: 10px; background: #fff; }
      .identity-status.is-info { font-size: 0.75rem; }
      ${designSystemCss}
      ${optionCss}
    </style>
  </head>
  <body>
    <button id="change" type="button">Change</button>
    <div class="identity-drawer-layer" role="presentation">
      <button type="button" class="identity-drawer-backdrop" aria-label="Close preparation approach"></button>
      <section class="identity-drawer" role="dialog" aria-modal="true">
        <header class="identity-drawer-header">
          <div>
            <h2 class="identity-section-title">Choose preparation approach</h2>
            <p class="identity-drawer-description">
              Select how much support you would like for this coaching relationship.
            </p>
          </div>
          <button type="button" class="identity-drawer-close" aria-label="Close">Close</button>
        </header>
        <div class="identity-drawer-content" tabindex="-1">
          <fieldset class="preparation-approach-options">
            <legend class="sr-only">Preparation approach</legend>
            <label class="preparation-approach-option is-selected"><input type="radio" checked /><div><div class="preparation-approach-option-heading"><strong>Use my default</strong></div><p>Use your Balanced default preference.</p></div></label>
            <label class="preparation-approach-option"><input type="radio" /><div><div class="preparation-approach-option-heading"><strong>Essential</strong></div><p>Latest information only.</p></div></label>
            <label class="preparation-approach-option"><input type="radio" /><div><div class="preparation-approach-option-heading"><strong>Balanced</strong><span class="identity-status is-info">Recommended</span></div><p>Themes and coaching questions.</p></div></label>
            <label class="preparation-approach-option"><input type="radio" /><div><div class="preparation-approach-option-heading"><strong>Comprehensive</strong></div><p>Patterns and deeper analysis.</p></div></label>
            <label class="preparation-approach-option"><input type="radio" /><div><div class="preparation-approach-option-heading"><strong>Extra tall option A</strong></div><p>Padding content to force scrolling on shorter viewports.</p></div></label>
            <label class="preparation-approach-option"><input type="radio" /><div><div class="preparation-approach-option-heading"><strong>Extra tall option B</strong></div><p>Padding content to force scrolling on shorter viewports.</p></div></label>
          </fieldset>
        </div>
        <footer class="identity-drawer-footer">
          <button type="button" class="identity-button">Cancel</button>
          <button type="button" class="identity-button">Save approach</button>
        </footer>
      </section>
    </div>
  </body>
</html>`;

const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
  { name: "320x568", width: 320, height: 568 },
];

function drawerFitsViewport(box, viewport) {
  if (!box) return false;
  // Allow 2px subpixel tolerance; drawer is right-docked so left may be mid-page.
  return (
    box.y >= -2 &&
    box.x >= -2 &&
    box.y + box.height <= viewport.height + 2 &&
    box.x + box.width <= viewport.width + 2
  );
}

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
    });
    await page.setContent(html, { waitUntil: "load" });
    // Wait for identity-drawer-enter (220ms) so bounding boxes are post-animation.
    await page.waitForTimeout(300);

    const drawerBox = await page.locator(".identity-drawer").boundingBox();
    const headerBox = await page.locator(".identity-drawer-header").boundingBox();
    const footerBox = await page.locator(".identity-drawer-footer").boundingBox();
    const firstOption = page.locator(".preparation-approach-option").first();
    const lastOption = page.locator(".preparation-approach-option").last();

    await firstOption.scrollIntoViewIfNeeded();
    const firstVisible = await firstOption.isVisible();
    const firstBox = await firstOption.boundingBox();

    await lastOption.scrollIntoViewIfNeeded();
    const lastVisible = await lastOption.isVisible();
    const lastBox = await lastOption.boundingBox();

    const footerStillVisible = await page
      .locator(".identity-drawer-footer")
      .evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
      });

    const headerStillVisible = await page
      .locator(".identity-drawer-header")
      .evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
      });

    const cancelVisible = await page
      .locator(".identity-drawer-footer .identity-button")
      .first()
      .isVisible();
    const saveVisible = await page
      .locator(".identity-drawer-footer .identity-button")
      .last()
      .isVisible();

    const contentMetrics = await page.locator(".identity-drawer-content").evaluate(
      (el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflowY: getComputedStyle(el).overflowY,
        minHeight: getComputedStyle(el).minHeight,
        scrollTopAfterLast: el.scrollTop,
      })
    );

    const drawerStyles = await page.locator(".identity-drawer").evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        position: style.position,
        height: style.height,
        maxHeight: style.maxHeight,
        overflow: style.overflow,
        gridTemplateRows: style.gridTemplateRows,
      };
    });

    const parentIsBody = await page.locator(".identity-drawer-layer").evaluate(
      (el) => el.parentElement === document.body
    );

    // Reopen-at-top check: scroll content, then reset like IdentityDrawer.
    await page.locator(".identity-drawer-content").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.locator(".identity-drawer-content").evaluate((el) => {
      el.scrollTo({ top: 0, behavior: "auto" });
    });
    const scrollTopAfterReset = await page
      .locator(".identity-drawer-content")
      .evaluate((el) => el.scrollTop);

    const pass =
      parentIsBody &&
      drawerStyles.position === "fixed" &&
      drawerStyles.overflow === "hidden" &&
      contentMetrics.overflowY === "auto" &&
      contentMetrics.minHeight === "0px" &&
      firstVisible &&
      lastVisible &&
      headerStillVisible &&
      footerStillVisible &&
      cancelVisible &&
      saveVisible &&
      scrollTopAfterReset === 0 &&
      drawerFitsViewport(drawerBox, viewport) &&
      Boolean(headerBox) &&
      Boolean(footerBox) &&
      Boolean(firstBox) &&
      Boolean(lastBox);

    results.push({
      viewport: viewport.name,
      pass,
      drawerStyles,
      contentMetrics,
      firstVisible,
      lastVisible,
      headerStillVisible,
      footerStillVisible,
      cancelVisible,
      saveVisible,
      scrollTopAfterReset,
      parentIsBody,
      drawerBox,
      drawerWithinViewport: drawerFitsViewport(drawerBox, viewport),
    });

    await page.close();
  }

  // Browser zoom 200% approximation via deviceScaleFactor + smaller CSS viewport.
  const zoomPage = await browser.newPage({
    viewport: { width: 720, height: 450 },
    deviceScaleFactor: 2,
  });
  await zoomPage.setContent(html, { waitUntil: "load" });
  await zoomPage.waitForTimeout(300);
  await zoomPage.locator(".preparation-approach-option").last().scrollIntoViewIfNeeded();
  const zoomFooterVisible = await zoomPage
    .locator(".identity-drawer-footer button")
    .last()
    .isVisible();
  const zoomHeaderVisible = await zoomPage
    .locator(".identity-drawer-header")
    .isVisible();
  results.push({
    viewport: "zoom-200%-approx",
    pass: zoomFooterVisible && zoomHeaderVisible,
    zoomFooterVisible,
    zoomHeaderVisible,
  });
  await zoomPage.close();

  // Large text / text scaling approximation.
  const largeTextPage = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await largeTextPage.addInitScript(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await largeTextPage.setContent(html, { waitUntil: "load" });
  await largeTextPage.waitForTimeout(300);
  await largeTextPage
    .locator(".preparation-approach-option")
    .last()
    .scrollIntoViewIfNeeded();
  const largeTextScrollable = await largeTextPage
    .locator(".identity-drawer-content")
    .evaluate((el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === "auto");
  const largeTextFooterVisible = await largeTextPage
    .locator(".identity-drawer-footer")
    .evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight + 2;
    });
  results.push({
    viewport: "large-text-200pct",
    pass: largeTextScrollable && largeTextFooterVisible,
    largeTextScrollable,
    largeTextFooterVisible,
  });
  await largeTextPage.close();
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.pass);
console.log(JSON.stringify({ results, failedCount: failed.length }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
