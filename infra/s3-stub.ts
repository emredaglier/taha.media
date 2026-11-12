import http from 'node:http'
import type { AddressInfo } from 'node:net'

export type StubObject = {
  body: Buffer
  headers: http.IncomingHttpHeaders
  lastModified: Date
}

/**
 * The object bytes of a PUT body. A streamed body (the SDK's `aws-chunked` encoding, as for an
 * upload read from a temp file) arrives as `<hex size>[;...]\r\n<bytes>\r\n` chunks, ending
 * with a zero-size chunk and the checksum trailer; S3 stores only the bytes.
 */
function decoded(body: Buffer, headers: http.IncomingHttpHeaders): Buffer {
  if (!headers['content-encoding']?.includes('aws-chunked')) return body
  const parts: Buffer[] = []
  for (let at = 0; ;) {
    const lineEnd = body.indexOf('\r\n', at)
    const size = parseInt(body.toString('latin1', at, lineEnd).split(';')[0]!, 16)
    if (!size) return Buffer.concat(parts)
    parts.push(body.subarray(lineEnd + 2, lineEnd + 2 + size))
    at = lineEnd + 2 + size + 2
  }
}

/**
 * In-process S3 stub (PUT, copy, list v2, DELETE) with path-style keys `/<bucket>/<key>`. It
 * records every request so tests can assert that a script never sent a DELETE, and a copy stores
 * an empty object under its key. No Docker or MinIO needed. Shared by the infra and cms tests.
 */
export type S3Stub = Awaited<ReturnType<typeof startS3Stub>>

export async function startS3Stub() {
  const objects = new Map<string, StubObject>()
  const requests: { method: string; key: string; headers: http.IncomingHttpHeaders }[] = []
  const stub = {
    endpoint: '',
    objects,
    requests,
    /** While true, copy requests (`x-amz-copy-source`) are answered with a 500. */
    failCopies: false,
    /** Requests that stored a new object (copies excluded), in order. */
    puts: () =>
      requests.filter(
        (r) => r.method === 'PUT' && typeof r.headers['x-amz-copy-source'] !== 'string',
      ),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub')
      const key = decodeURIComponent(url.pathname).replace(/^\/[^/]+\/?/, '')
      requests.push({ method: req.method ?? '', key, headers: req.headers })
      const isCopy = typeof req.headers['x-amz-copy-source'] === 'string'
      if (stub.failCopies && isCopy) {
        res.writeHead(500, { 'Content-Type': 'application/xml' })
        return res.end('<Error><Code>InternalError</Code><Message>stub</Message></Error>')
      }
      if (req.method === 'PUT') {
        objects.set(key, {
          body: decoded(Buffer.concat(chunks), req.headers),
          headers: req.headers,
          lastModified: new Date(),
        })
        if (isCopy) {
          res.writeHead(200, { 'Content-Type': 'application/xml' })
          return res.end('<CopyObjectResult><ETag>"stub"</ETag></CopyObjectResult>')
        }
        res.writeHead(200, { ETag: '"stub"' })
        return res.end()
      }
      if (req.method === 'DELETE') {
        objects.delete(key)
        res.writeHead(204)
        return res.end()
      }
      if (req.method === 'GET') {
        const prefix = url.searchParams.get('prefix') ?? ''
        const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort()
        const xml =
          '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>' +
          `<IsTruncated>false</IsTruncated><KeyCount>${keys.length}</KeyCount>` +
          keys
            .map((k) => {
              const o = objects.get(k)!
              return `<Contents><Key>${k}</Key><LastModified>${o.lastModified.toISOString()}</LastModified><Size>${o.body.length}</Size></Contents>`
            })
            .join('') +
          '</ListBucketResult>'
        res.writeHead(200, { 'content-type': 'application/xml' })
        return res.end(xml)
      }
      res.writeHead(405)
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  stub.endpoint = `http://127.0.0.1:${port}`
  return stub
}
