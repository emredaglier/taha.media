import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { makeSeedLoops } from './seed-loops.ts'

// The dev seed's loop step with stub ffmpeg and ffprobe: nothing is encoded. The real-ffmpeg run
// is in make-loops.test.ts.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-loops-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
afterEach(() => vi.restoreAllMocks())

const bin = path.join(tmp, 'bin')
const log = path.join(tmp, 'ffmpeg.log')
fs.mkdirSync(bin)
fs.writeFileSync(
  path.join(bin, 'ffmpeg'),
  '#!/bin/sh\n[ "$1" = -version ] && exit 0\necho "$@" >> ' +
    `${log}\nfor last; do :; done\ntouch "$last"\n`,
  { mode: 0o755 },
)
fs.writeFileSync(
  path.join(bin, 'ffprobe'),
  '#!/bin/sh\n[ "$1" = -version ] && exit 0\necho 640x360\n',
  {
    mode: 0o755,
  },
)

const dbFolder = path.join(tmp, 'data')
fs.mkdirSync(path.join(dbFolder, 'videos'), { recursive: true })
for (const name of ['demo-previewloop-1-a', 'demo-showreel-1', 'demo-showreel-2']) {
  fs.writeFileSync(path.join(dbFolder, 'videos', `${name}.mp4`), '')
}

describe('makeSeedLoops', () => {
  it('runs make-loops.sh on the database folder when ffmpeg and ffprobe are installed', () => {
    vi.stubEnv('PATH', `${bin}:/usr/bin:/bin`)
    expect(makeSeedLoops(path.join(dbFolder, 'site.db'))).toBe(0)
    expect(fs.readFileSync(log, 'utf8')).toMatch(/testsrc2/)
  })

  it('says the loops stay flat and still succeeds without ffmpeg', () => {
    vi.stubEnv('PATH', path.join(tmp, 'empty'))
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(makeSeedLoops(path.join(dbFolder, 'site.db'))).toBe(0)
    expect(out).toHaveBeenCalledWith(expect.stringMatching(/loops stay flat.*brew install ffmpeg/))
  })

  it('reports a make-loops failure and exits non-zero', () => {
    vi.stubEnv('PATH', `${bin}:/usr/bin:/bin`)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    // No videos in this folder, so make-loops.sh itself fails.
    expect(makeSeedLoops(path.join(tmp, 'no-videos', 'site.db'))).toBe(1)
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/seed data is written/))
  })
})
