import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { readMp4, readMp4File } from './mp4'
import { videoFixture } from './testing'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taha-mp4-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

const write = (name: string, data: Buffer): string => {
  const file = path.join(dir, name)
  fs.writeFileSync(file, data)
  return file
}

/** The top-level boxes of an MP4 by type (the fixtures have only 32-bit sizes). */
function topBoxes(data: Buffer): Record<string, Buffer> {
  const found: Record<string, Buffer> = {}
  for (let offset = 0; offset < data.length;) {
    const size = data.readUInt32BE(offset)
    found[data.toString('latin1', offset + 4, offset + 8)] = data.subarray(offset, offset + size)
    offset += size
  }
  return found
}

describe('readMp4File', () => {
  it.each(['loop-ok.mp4', 'portrait.mp4', 'with-audio.mp4', 'hevc.mp4', 'long-200s.mp4'])(
    'reads what readMp4 reads from the same bytes: %s',
    async (name) => {
      const data = videoFixture(name)
      expect(await readMp4File(write(name, data))).toEqual(readMp4(data))
    },
  )

  it('reads a header that sits after the media data, without loading the media data', async () => {
    // ftyp, a 3 GiB mdat (a sparse hole on disk, beyond what one Buffer may hold), then moov.
    const { ftyp, moov } = topBoxes(videoFixture('with-audio.mp4'))
    const mdatBytes = 3 * 1024 ** 3
    const mdatHeader = Buffer.alloc(16)
    mdatHeader.writeUInt32BE(1, 0)
    mdatHeader.write('mdat', 4, 'latin1')
    mdatHeader.writeBigUInt64BE(BigInt(mdatBytes), 8)
    const file = write('moov-last.mp4', Buffer.concat([ftyp!, mdatHeader]))
    fs.truncateSync(file, ftyp!.length + mdatBytes)
    fs.appendFileSync(file, moov!)

    expect(await readMp4File(file)).toEqual(readMp4(videoFixture('with-audio.mp4')))
  })

  it('finds nothing in a file that is not an MP4, or does not start with ftyp', async () => {
    expect(await readMp4File(write('text.mp4', Buffer.from('Merhaba, bu bir video değil.')))).toBe(
      undefined,
    )
    expect(await readMp4File(write('empty.mp4', Buffer.alloc(0)))).toBe(undefined)
    const { ftyp, moov } = topBoxes(videoFixture('loop-ok.mp4'))
    expect(await readMp4File(write('moov-first.mp4', Buffer.concat([moov!, ftyp!])))).toBe(
      undefined,
    )
  })
})
