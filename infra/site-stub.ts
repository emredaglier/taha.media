// A fake taha.media for the post-deploy check and deploy tests. One server stands in for the site,
// the CDN (cdn.taha.media: release chunks and R2 media) and the alert webhook (POST /hook).
//
// The page a release serves carries that release's deployment id, the way Next renders it with
// `deploymentId` set: `<html data-dpl-id="<id>">` and `?dpl=<id>` on chunks under
// `<cdn>/releases/<id>/_next/static/`. The fake docker (deploy.test.ts) reports which release is
// live with PUT /__live/<id>; a release in `broken` serves a 500 home, like a bad build behind a
// healthy container. `stale` keeps the old page served after a swap (a container that never
// changed), so the release-id check has something to catch.
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export type Route = { status: number; type?: string; body?: string }
export type Hook = { contentType: string; body: string }

const html = (body: string): Route => ({ status: 200, type: 'text/html; charset=utf-8', body })
const CHUNK = /^\/releases\/([A-Za-z0-9._-]+)\/_next\/static\/chunks\/main\.js$/

export const startSiteStub = async () => {
  const hooks: Hook[] = []
  const hits: string[] = []
  const live = { tag: 'none', broken: new Set<string>(), stale: '' }
  let base = ''
  const routes = new Map<string, Route>()

  /** Home as release `tag` renders it. */
  const home = (tag: string) =>
    `<!doctype html><html lang="tr" data-dpl-id="${tag}"><head>` +
    `<link rel="stylesheet" href="${base}/releases/${tag}/_next/static/css/app.css?dpl=${tag}">` +
    `<script src="${base}/releases/${tag}/_next/static/chunks/main.js?dpl=${tag}" async=""></script>` +
    `</head><body><main><a href="/isler/ornek-is">Örnek iş</a></main></body></html>`

  const reset = () => {
    routes.clear()
    live.stale = ''
    routes.set(
      '/isler/ornek-is',
      html(
        `<main><h1>Örnek iş</h1><img alt="Kapak" src="${base}/media/ornek-1a2b-small.webp?v=1&amp;w=640" ` +
          `srcSet="${base}/media/ornek-1a2b-small.webp 640w"></main>`,
      ),
    )
    routes.set('/isler', html(`<main><a href="/isler/ornek-is">Örnek iş</a></main>`))
    routes.set('/media/ornek-1a2b-small.webp', { status: 200, type: 'image/webp', body: 'RIFF' })
  }

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const p = new URL(req.url ?? '/', 'http://stub').pathname
      if (req.method === 'POST' && p === '/hook') {
        hooks.push({
          contentType: req.headers['content-type'] ?? '',
          body: Buffer.concat(chunks).toString(),
        })
        res.writeHead(204).end()
        return
      }
      if (req.method === 'PUT' && p.startsWith('/__live/')) {
        live.tag = p.slice('/__live/'.length)
        res.writeHead(204).end()
        return
      }
      hits.push(p)
      const override = routes.get(p)
      if (override) {
        res.writeHead(override.status, { 'content-type': override.type ?? 'text/plain' })
        res.end(override.body ?? '')
        return
      }
      if (p === '/') {
        if (live.broken.has(live.tag)) {
          res.writeHead(500, { 'content-type': 'text/plain' }).end('broken release')
          return
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(home(live.stale || live.tag))
        return
      }
      if (CHUNK.test(p)) {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end('self.x=1')
        return
      }
      res.writeHead(404, { 'content-type': 'text/html' }).end('Not Found')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  reset()

  return {
    base,
    hooks,
    hits,
    live,
    routes,
    reset,
    home,
    /** No Work published yet: the clean-slate launch. */
    noWorks() {
      routes.set('/', html(home(live.tag).replace(/<a href="\/isler\/ornek-is">[^<]*<\/a>/, '')))
      routes.set('/isler', html('<main><p>Henüz iş yok.</p></main>'))
      routes.delete('/isler/ornek-is')
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
