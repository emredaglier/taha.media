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
  it('turns each loop into a 1280x720 clip with its own hue and each Showreel video into a clip at its own size', () => {
    const result = makeLoops('ok', [
      'videos/demo-previewloop-1-a.mp4',
      'videos/demo-previewloop-2-b.mp4',
      ...reels,
    ])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('ok videos/demo-previewloop-1-a.mp4 (hue 47)')
    expect(result.stdout).toContain('ok videos/demo-previewloop-2-b.mp4 (hue 94)')
    expect(result.stdout).toContain('ok videos/demo-showreel-1.mp4 (640x360)')
    expect(result.stdout).toContain('ok videos/demo-showreel-2.mp4 (360x640)')
    expect(result.log).toContain('size=1280x720')
    expect(result.log).toContain('hue=h=47')
    expect(result.log).toContain('size=640x360')
    expect(result.log).toContain('size=360x640')
  })

  it.each([[[]], [reels.slice(0, 1)]])(
    'fails unless both Showreel videos exist (%j)',
    (present) => {
      const result = makeLoops(`reels-${present.length}`, [
        'videos/demo-previewloop-1-a.mp4',
        ...present,
      ])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(`expected 2 videos/demo-showreel-*.mp4`)
      expect(result.stderr).toContain(`found ${present.length}`)
    },
  )

  it('still says so when there is no loop at all', () => {
    const result = makeLoops('empty', [])
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/no videos\/demo-previewloop-/)
  })
})

// The real script on real ffmpeg (skipped where ffmpeg is missing): every clip must move, so two
// frames 1 s apart differ, and two loops with different numbers are not the same picture.
const hasFfmpeg = ['ffmpeg', 'ffprobe'].every((tool) => spawnSync(tool, ['-version']).status === 0)

describe.skipIf(!hasFfmpeg)('make-loops.sh with real ffmpeg', () => {
  const ff = (...args: string[]) => {
    const result = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
    expect(result.stderr).toBe('')
    return result.stdout
  }
  // md5 of the decoded frame at `seconds`
  const frame = (clip: string, seconds: number) =>
    ff('-ss', String(seconds), '-i', clip, '-frames:v', '1', '-f', 'md5', '-')

  it('makes a Preview loop and a Showreel clip whose frames 1 s apart differ', () => {
    const dir = path.join(tmp, 'real')
    fs.mkdirSync(path.join(dir, 'videos'), { recursive: true })
    for (const name of ['previewloop-1-a', 'previewloop-2-b', 'showreel-1', 'showreel-2']) {
      ff(
        '-f',
        'lavfi',
        '-i',
        'color=size=640x360:rate=25',
        '-t',
        '1',
        path.join(dir, `videos/demo-${name}.mp4`),
      )
    }
    const result = spawnSync('/bin/sh', [script, dir], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    for (const name of ['previewloop-1-a', 'showreel-1']) {
      const clip = path.join(dir, `videos/demo-${name}.mp4`)
      expect(frame(clip, 0.5)).not.toBe(frame(clip, 1.5))
    }
    const loop = (n: string) => path.join(dir, `videos/demo-previewloop-${n}.mp4`)
    expect(frame(loop('1-a'), 0.5)).not.toBe(frame(loop('2-b'), 0.5))
  })
})
