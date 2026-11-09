// `pnpm check:shaders`: does the Helix's WebGL2 work? Bundles entry.ts (the real renderer,
// apps/web/src/components/helix) with esbuild, runs it in headless Chromium on SwiftShader (a
// software GL, so no GPU is needed) and judges what it saw (pixels.ts). Exit code 0/1, one line on
// a pass, the reasons (and a failing shader's GL info log) on a fail.
//
// A shader that doesn't compile makes the Helix fall back to the static Home, which neither the
// unit tests (jsdom has no WebGL) nor the smoke (it accepts the fallback) would notice.
//
// Needs Chromium for Playwright once: `pnpm exec playwright install chromium`. It starts a
// browser, so run it once, not in parallel with other heavy work (CLAUDE.md, "Memory-heavy
// commands"). Screenshots of the two judged frames go to scripts/check-shaders/.output/.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'
import { build } from 'esbuild'

import { clearOutput, saveShots } from './output.ts'
import { judge, summary, type Report } from './pixels.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputDir = process.env.CHECK_SHADERS_OUTPUT_DIR ?? path.join(here, '.output')
const TIMEOUT_MS = 120_000

const PAGE = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#000}#host{position:relative;width:1280px;height:800px}canvas{width:100%;height:100%;display:block}</style>
<div id="host"><canvas id="helix"></canvas></div>`

async function bundle(): Promise<string> {
  const { outputFiles } = await build({
    entryPoints: [path.join(here, 'entry.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    logLevel: 'warning',
  })
  return outputFiles[0]!.text
}

/** Runs the page and returns its report, with the page's own console output printed as it goes. */
async function observe(script: string): Promise<Report> {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    page.on('console', (message) => console.log(`[page] ${message.text()}`))
    page.on('pageerror', (error) => console.error(`[page error] ${error.message}`))
    await page.setContent(PAGE)
    await page.addScriptTag({ content: script })
    await page.waitForFunction(() => window.__shaderCheck !== undefined, null, {
      timeout: TIMEOUT_MS,
    })
    return await page.evaluate(() => window.__shaderCheck!)
  } finally {
    await browser.close()
  }
}

async function main(): Promise<number> {
  clearOutput(outputDir)
  const report = await observe(await bundle())
  if ('error' in report) {
    // `createHelixRenderer` threw: a shader didn't compile or link (the message is the GL info
    // log; the stack names the program's creator), or the page crashed.
    console.error(`check:shaders FAILED: the Helix renderer did not run.\n${report.error}`)
    return 1
  }
  saveShots(outputDir, report.shots)
  const failures = judge(report.observation)
  if (failures.length > 0) {
    console.error(
      `check:shaders FAILED (screenshots in ${path.relative(process.cwd(), outputDir)}):\n${failures.map((reason) => `  - ${reason}`).join('\n')}`,
    )
    return 1
  }
  console.log(summary(report.observation))
  return 0
}

process.exitCode = await main().catch((error: unknown) => {
  console.error(error)
  return 1
})
