import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

// make-loops.sh on temp folders with a stub ffmpeg that only records the call and writes its
// output file, and a stub ffprobe that says demo-showreel-2 is the portrait one: nothing is encoded.
const script = path.resolve(import.meta.dirname, 'make-loops.sh')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-loops-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const bin = path.join(tmp, 'bin')
fs.mkdirSync(bin)
fs.writeFileSync(
  path.join(bin, 'ffmpeg'),
  '#!/bin/sh\necho "$@" >> "$FFMPEG_LOG"\nfor last; do :; done\ntouch "$last"\n',
  { mode: 0o755 },
)
fs.writeFileSync(
  path.join(bin, 'ffprobe'),
  '#!/bin/sh\ncase "$*" in *-2.mp4*) echo 360x640 ;; *) echo 640x360 ;; esac\n',
  { mode: 0o755 },
)

const reels = ['videos/demo-showreel-1.mp4', 'videos/demo-showreel-2.mp4']

function makeLoops(name: string, files: string[]) {
  const dir = path.join(tmp, name)
  fs.mkdirSync(dir, { recursive: true })
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), '')
  }
  const log = path.join(tmp, `${name}.log`)
  const result = spawnSync('/bin/sh', [script, dir], {
    encoding: 'utf8',
    env: { PATH: `${bin}:/usr/bin:/bin`, FFMPEG_LOG: log },
  })
  return { ...result, log: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' }
}

describe('make-loops.sh', () => {
  it('names the loop that has no poster and does not call ffmpeg', () => {
    const result = makeLoops('no-poster', ['videos/demo-previewloop-3-a.mp4'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('videos/demo-previewloop-3-a.mp4')
    expect(result.stderr).toMatch(/no poster/)
    expect(result.log).toBe('')
  })

  it('turns a loop with its poster and each Showreel video into a clip at its own size', () => {
    const result = makeLoops('ok', [
      'videos/demo-previewloop-1-a.mp4',
      'images/demo-1-x-1280x853.webp',
      ...reels,
    ])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'ok videos/demo-previewloop-1-a.mp4 <- images/demo-1-x-1280x853.webp',
    )
    expect(result.stdout).toContain('ok videos/demo-showreel-1.mp4 (640x360)')
    expect(result.stdout).toContain('ok videos/demo-showreel-2.mp4 (360x640)')
    expect(result.log).toContain('images/demo-1-x-1280x853.webp')
    expect(result.log).toContain('size=640x360')
    expect(result.log).toContain('size=360x640')
  })

  it.each([[[]], [reels.slice(0, 1)]])(
    'fails unless both Showreel videos exist (%j)',
    (present) => {
      const result = makeLoops(`reels-${present.length}`, [
        'videos/demo-previewloop-1-a.mp4',
        'images/demo-1-x-1280x853.webp',
        ...present,
      ])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(`expected 2 videos/demo-showreel-*.mp4`)
      expect(result.stderr).toContain(`found ${present.length}`)
    },
  )

  it('still says so when there is no loop at all', () => {
    const result = makeLoops('empty', ['images/demo-1-x-1280x853.webp'])
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/no videos\/demo-previewloop-/)
  })
})
