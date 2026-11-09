import { expect, type Page } from '@playwright/test'

/**
 * Scrolls every image into view (they are lazy) and waits for the network to go quiet. Only
 * locator calls here: `page.evaluate` does not run when JavaScript is disabled.
 *
 * Hydration can replace images under this loop: on a phone the server-rendered albums strip is
 * swapped for the carousel, and `scrollIntoViewIfNeeded` throws, without retrying, when its element
 * goes away. So count and resolve afresh at every step, and retry a step that lost its element.
 *
 * An image with no box on screen has nothing to scroll to, and is skipped: on Home, once the Helix
 * runs, the static Home stays in the page visually hidden (ADR-0103). `brokenImages` still loads
 * and checks every image.
 */
export async function loadEverything(page: Page): Promise<void> {
  const images = page.locator('img')
  for (let i = 0; i < (await images.count()); i++) {
    await expect(async () => {
      const image = images.nth(i)
      if ((await image.count()) && (await image.isVisible())) {
        await image.scrollIntoViewIfNeeded({ timeout: 10_000 })
      }
    }).toPass({ timeout: 30_000 })
  }
  await page.waitForLoadState('networkidle')
}
