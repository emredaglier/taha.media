import fs from 'node:fs/promises'

/** What the MP4 header says about a video (ADR-0008). Read in JavaScript, no ffmpeg. */
export type Mp4Info = {
  /** Display size in pixels: a track rotated by 90 or 270 degrees has its sides swapped. */
  width: number
  height: number
  durationSeconds: number
  /** Sample entry type of the video track, e.g. `avc1` (H.264) or `hvc1` (H.265). */
  codec: string
  hasAudio: boolean
}

type Box = { type: string; start: number; end: number; payload: number }

/** The boxes between `start` and `end`. Stops at the first malformed one. */
function boxes(data: Buffer, start: number, end: number): Box[] {
  const found: Box[] = []
  let offset = start
  while (offset + 8 <= end) {
    let size = data.readUInt32BE(offset)
    const type = data.toString('latin1', offset + 4, offset + 8)
    let header = 8
    if (size === 1) {
      if (offset + 16 > end) break
      size = Number(data.readBigUInt64BE(offset + 8))
      header = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < header || offset + size > end) break
    found.push({ type, start: offset, end: offset + size, payload: offset + header })
    offset += size
  }
  return found
}

const child = (data: Buffer, parent: Box, type: string): Box | undefined =>
  boxes(data, parent.payload, parent.end).find((box) => box.type === type)

/** Duration and timescale of an `mvhd` or `mdhd` box (same layout). */
function readDuration(data: Buffer, box: Box): number | undefined {
  const version = data[box.payload]
  const at = box.payload + (version === 1 ? 20 : 12)
  if (at + (version === 1 ? 12 : 8) > box.end) return undefined
  const timescale = data.readUInt32BE(at)
  const duration = version === 1 ? Number(data.readBigUInt64BE(at + 4)) : data.readUInt32BE(at + 4)
  return timescale > 0 ? duration / timescale : undefined
}

/** Track display size from `tkhd`, swapped when the matrix rotates the picture by a quarter turn. */
function readTrackSize(data: Buffer, box: Box): { width: number; height: number } | undefined {
  const matrix = box.payload + (data[box.payload] === 1 ? 52 : 40)
  const size = matrix + 36
  if (size + 8 > box.end) return undefined
  const width = data.readUInt32BE(size) / 65536
  const height = data.readUInt32BE(size + 4) / 65536
  const a = data.readInt32BE(matrix)
  const b = data.readInt32BE(matrix + 4)
  return a === 0 && b !== 0 ? { width: height, height: width } : { width, height }
}

/**
 * Reads the header of an MP4 (ISO base media) file. Returns `undefined` when the bytes are not an
 * MP4 with a readable video track. The codec is returned as found; judging it is the caller's job.
 */
export function readMp4(data: Buffer): Mp4Info | undefined {
  const top = boxes(data, 0, data.length)
  if (top[0]?.type !== 'ftyp') return undefined
  const moov = top.find((box) => box.type === 'moov')
  if (!moov) return undefined

  let video: { width: number; height: number; codec: string; seconds?: number } | undefined
  let hasAudio = false
  for (const trak of boxes(data, moov.payload, moov.end).filter((box) => box.type === 'trak')) {
    const mdia = child(data, trak, 'mdia')
    const hdlr = mdia && child(data, mdia, 'hdlr')
    if (!mdia || !hdlr) continue
    const handler = data.toString('latin1', hdlr.payload + 8, hdlr.payload + 12)
    if (handler === 'soun') hasAudio = true
    if (handler !== 'vide' || video) continue

    const tkhd = child(data, trak, 'tkhd')
    const size = tkhd && readTrackSize(data, tkhd)
    const minf = child(data, mdia, 'minf')
    const stbl = minf && child(data, minf, 'stbl')
    const stsd = stbl && child(data, stbl, 'stsd')
    // stsd: version and flags (4), entry count (4), then the first entry: size (4), type (4).
    if (!size || !stsd || stsd.payload + 16 > stsd.end) continue
    const mdhd = child(data, mdia, 'mdhd')
    video = {
      ...size,
      codec: data.toString('latin1', stsd.payload + 12, stsd.payload + 16),
      seconds: mdhd && readDuration(data, mdhd),
    }
  }
  if (!video) return undefined

  const mvhd = child(data, moov, 'mvhd')
  const durationSeconds = (mvhd && readDuration(data, mvhd)) ?? video.seconds
  if (durationSeconds === undefined) return undefined
  return {
    width: Math.round(video.width),
    height: Math.round(video.height),
    durationSeconds,
    codec: video.codec,
    hasAudio,
  }
}

/**
 * `readMp4` for a file on disk (an upload Payload spooled to a temp file): reads only the box
 * headers, `ftyp` and `moov`, never the media data, wherever in the file `moov` sits.
 */
export async function readMp4File(filePath: string): Promise<Mp4Info | undefined> {
  const file = await fs.open(filePath, 'r')
  try {
    const end = (await file.stat()).size
    const read = async (position: number, length: number): Promise<Buffer> => {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await file.read(buffer, 0, length, position)
      return buffer.subarray(0, bytesRead)
    }
    const kept: Buffer[] = []
    let offset = 0
    while (offset + 8 <= end) {
      const header = await read(offset, 16)
      let size = header.readUInt32BE(0)
      const type = header.toString('latin1', 4, 8)
      if (size === 1) {
        if (header.length < 16) break
        size = Number(header.readBigUInt64BE(8))
      } else if (size === 0) {
        size = end - offset
      }
      if (size < 8 || offset + size > end) break
      if (offset === 0 && type !== 'ftyp') return undefined
      if (type === 'ftyp' || type === 'moov') kept.push(await read(offset, size))
      if (type === 'moov') break
      offset += size
    }
    return readMp4(Buffer.concat(kept))
  } finally {
    await file.close()
  }
}
