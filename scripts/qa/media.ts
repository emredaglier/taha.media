// QA stand-in for the R2 media bucket: serves a QA folder's images/ and videos/ at <origin>/<key>,
// with CORS (*) and byte ranges, so WebGL can read loops and posters (#50, #55). Files are looked
// up by key in `images/` first, then `videos/`; nothing outside those two folders is served.
//
//   node scripts/qa/media.ts <qa dir> <port> [host, default 127.0.0.1]
import { createReadStream, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream'

const FOLDERS = ['images', 'videos']

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.vtt': 'text/vtt',
}

type Hit = { file: string; size: number }

function find(roots: string[], key: string): Hit | null {
  for (const root of roots) {
    const file = path.resolve(root, key)
    if (!file.startsWith(root + path.sep)) continue
    try {
      const stat = statSync(file)
      if (stat.isFile()) return { file, size: stat.size }
    } catch {
      // not in this folder
    }
  }
  return null
}

/**
 * The key a request path names, or the status to refuse it with: 400 for an undecodable path or a
 * null byte, 403 for a `..` segment (also encoded: `%2e%2e`, `%2f`, `%5c`). The raw path is
 * checked, not a normalised one, so `/../x` is refused instead of quietly becoming `/x`.
 */
export function keyFromRequestPath(rawUrl: string): { key: string } | { status: 400 | 403 } {
  const rawPath = rawUrl.split(/[?#]/, 1)[0] ?? ''
  let decoded: string
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return { status: 400 }
  }
  if (decoded.includes('\0')) return { status: 400 }
  if (decoded.split(/[\\/]/).includes('..')) return { status: 403 }
  return { key: decoded.replace(/^\/+/, '') }
}

/** `null` when the header is absent or not a single byte range (then the whole file is served). */
function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (!match || (match[1] === '' && match[2] === '')) return null
  let start: number
  let end: number
  if (match[1] === '') {
    // A suffix: the last N bytes.
    const length = Number(match[2])
    if (length === 0) return 'unsatisfiable'
    start = Math.max(0, size - length)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  if (start >= size || start > end) return 'unsatisfiable'
  return { start, end }
}

/** The media server for a QA folder. The caller listens; tests listen on port 0. */
export function createMediaServer(qaDir: string): http.Server {
  const roots = FOLDERS.map((folder) => path.resolve(qaDir, folder))
  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Range')
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
    if (req.method === 'OPTIONS') return void res.writeHead(204).end()
    if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405).end()

    const target = keyFromRequestPath(req.url ?? '/')
    if ('status' in target) return void res.writeHead(target.status).end('Refused')
    const hit = find(roots, target.key)
    if (!hit) return void res.writeHead(404).end('Not found')

    const type = TYPES[path.extname(hit.file).toLowerCase()] ?? 'application/octet-stream'
    const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' }
    const range = parseRange(req.headers.range, hit.size)
    if (range === 'unsatisfiable') {
      return void res.writeHead(416, { 'Content-Range': `bytes */${hit.size}` }).end()
    }
    if (range) {
      res.writeHead(206, {
        ...base,
        'Content-Length': range.end - range.start + 1,
        'Content-Range': `bytes ${range.start}-${range.end}/${hit.size}`,
      })
    } else {
      res.writeHead(200, { ...base, 'Content-Length': hit.size })
    }
    if (req.method === 'HEAD') return void res.end()
    pipeline(createReadStream(hit.file, range ?? {}), res, () => undefined)
  })
}

if (import.meta.main) {
  const [qaDir, portArg, host = '127.0.0.1'] = process.argv.slice(2)
  if (!qaDir || !portArg || Number.isNaN(Number(portArg))) {
    console.error('Usage: node scripts/qa/media.ts <qa dir> <port> [host]')
    process.exit(1)
  }
  createMediaServer(qaDir).listen(Number(portArg), host, () =>
    console.log(`media on ${host}:${portArg} from ${qaDir}`),
  )
}
