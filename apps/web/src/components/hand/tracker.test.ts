import { createHash } from 'node:crypto'
import fs from 'node:fs'
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

  it('loads nothing from a third-party host and never through FilesetResolver', () => {
    for (const file of sources(path.join(web, 'src'))) {
      // Comments may cite where a file came from; code may not fetch from there. A `//` after
      // a colon is a URL, not a comment.
      const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm, '')
      expect(code, file).not.toMatch(/jsdelivr|googleapis|unpkg|FilesetResolver/)
    }
  })
})
