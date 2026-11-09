import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/*
 * Repo guards for the self-hosted hand-tracking files (ADR-0005, #56): they scan source on
 * purpose. The model is vendored from
 * https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
 * and must stay that file.
 */
const MODEL_SHA256 = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'

const here = import.meta.dirname
const web = path.join(here, '../../..')
const trackerSource = fs.readFileSync(path.join(here, 'tracker.ts'), 'utf8')

/** Every non-test source file under `apps/web/src`. */
const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sources(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })

describe('the hand model', () => {
  it('is the vendored file the tracker points at, unchanged', () => {
    const match = /new URL\('(\.\/models\/[^']+\.task)', import\.meta\.url\)/.exec(trackerSource)
    expect(match, 'tracker.ts names the model with new URL(…, import.meta.url)').not.toBeNull()
    const bytes = fs.readFileSync(path.join(here, match![1]!))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(MODEL_SHA256)
  })
})

describe('MediaPipe', () => {
  it('is pinned to an exact version', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(web, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@mediapipe/tasks-vision']).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('as installed, sends no usage logs to Google (patches/@mediapipe__tasks-vision@*.patch)', () => {
    // MediaPipe builds a usage logger for every task and POSTs to Google's logging endpoint with
    // an API key (every 60 s, and on close). The pnpm patch removes the logger and the endpoint;
    // this reads the files the bundler actually resolves, so a version bump that drops the patch
    // fails here.
    const entry = createRequire(path.join(web, 'package.json')).resolve('@mediapipe/tasks-vision')
    const dir = path.dirname(entry)
    for (const name of ['vision_bundle.mjs', 'vision_bundle.cjs', 'vision_bundle.js']) {
      const bundle = fs.readFileSync(path.join(dir, name), 'utf8')
      expect(bundle, name).not.toMatch(/odml\.pa\.googleapis\.com|\/v1\/log\b/)
      expect(bundle, name).not.toContain('x-goog-api-key')
      // The logger's construction in the task runner: `t.o=new Mh(t.D(),e,r)` in 1.2.2.
      expect(bundle, name).not.toMatch(/\.o=new [\w$]+\(\w\.D\(\),\w,\w\)/)
      expect(bundle, name).toContain('t.o=void 0')
    }
  })

  it('loads nothing from a third-party host and never through FilesetResolver', () => {
    for (const file of sources(path.join(web, 'src'))) {
      // Comments may cite where a file came from; code may not fetch from there. A `//` after
      // a colon is a URL, not a comment.
      const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm, '')
      expect(code, file).not.toMatch(/jsdelivr|googleapis|unpkg|FilesetResolver/)
    }
  })
})
