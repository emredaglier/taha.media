import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import config from '../next.config'

it('sends no Client Hints headers: Payload adds them for its admin, and Chrome re-requests the first page for Critical-CH', async () => {
  const rules = (await config.headers?.()) ?? []
  const names = rules.flatMap((rule) => rule.headers.map(({ key, value }) => `${key}: ${value}`))
  expect(names.filter((line) => /accept-ch|critical-ch|sec-ch-/i.test(line))).toEqual([])
})

describe('Docker build hooks', () => {
  const load = async (env: Record<string, string>) => {
    vi.resetModules()
    for (const name of ['NEXT_STANDALONE', 'ASSET_PREFIX', 'DEPLOYMENT_ID']) {
      vi.stubEnv(name, env[name] ?? '')
    }
    return (await import('../next.config')).default
  }
  afterEach(() => vi.unstubAllEnvs())

  it('builds a plain app by default: no standalone output, no asset prefix, no deployment id', async () => {
    const built = await load({})
    expect(built.output).toBeUndefined()
    expect(built.assetPrefix).toBeUndefined()
    expect(built.deploymentId).toBeUndefined()
  })

  it('builds the self-contained server the image runs, traced from the monorepo root', async () => {
    const built = await load({ NEXT_STANDALONE: '1' })
    expect(built.output).toBe('standalone')
    // The root holds the workspace packages the server bundle needs.
    expect(fs.existsSync(path.join(built.outputFileTracingRoot ?? '', 'packages/cms-config'))).toBe(
      true,
    )
  })

  it('takes the CDN prefix and the deployment id from the build arguments (ADR-0005)', async () => {
    const built = await load({
      ASSET_PREFIX: 'https://cdn.taha.media/releases/abc',
      DEPLOYMENT_ID: 'abc',
    })
    expect(built.assetPrefix).toBe('https://cdn.taha.media/releases/abc')
    expect(built.deploymentId).toBe('abc')
  })
})

describe('Sentry source maps (#35)', () => {
  const load = async (env: Record<string, string>) => {
    vi.resetModules()
    for (const name of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
      vi.stubEnv(name, env[name] ?? '')
    }
    return (await import('../next.config')).default
  }
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ['no settings', {}],
    ['no auth token', { SENTRY_ORG: 'o', SENTRY_PROJECT: 'p' }],
    ['no org', { SENTRY_AUTH_TOKEN: 't', SENTRY_PROJECT: 'p' }],
    ['no project', { SENTRY_AUTH_TOKEN: 't', SENTRY_ORG: 'o' }],
  ])('generates and uploads no source maps with %s', async (_name, env) => {
    expect((await load(env)).productionBrowserSourceMaps).toBeUndefined()
  })

  it('generates source maps for the upload when the token, org and project are all set', async () => {
    const built = await load({ SENTRY_AUTH_TOKEN: 't', SENTRY_ORG: 'o', SENTRY_PROJECT: 'p' })
    expect(built.productionBrowserSourceMaps).toBe(true)
  })
})

/** The slice of Next's compiled webpack this test calls. */
type WebpackLib = {
  webpack: (options: object, done: (error: Error | null, stats?: CompiledStats) => void) => void
}
type CompiledStats = {
  hasErrors(): boolean
  toString(options: object): string
  compilation: { assets: Record<string, unknown> }
}

describe("the server build leaves Hand control's MediaPipe files out (#69)", () => {
  /**
   * Compiles a two-file stand-in for `components/hand` (the entry dynamically imports `./tracker`,
   * which names a file with `new URL(…, import.meta.url)`) with the config's own webpack hook and
   * Next's bundled webpack, the way a server or a browser build would, and lists what it emits.
   */
  const emitted = async (isServer: boolean) => {
    const lib = (await import(
      // @ts-expect-error Next's compiled webpack has no declaration file.
      'next/dist/compiled/webpack/webpack-lib'
    )) as unknown as WebpackLib
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-build-'))
    try {
      const hand = path.join(root, 'src/components/hand')
      fs.mkdirSync(hand, { recursive: true })
      fs.writeFileSync(
        path.join(hand, 'entry.js'),
        "export const load = () => import('./tracker')\n",
      )
      fs.writeFileSync(
        path.join(hand, 'tracker.js'),
        "export const model = new URL('./model.task', import.meta.url)\n",
      )
      fs.writeFileSync(path.join(hand, 'model.task'), 'model bytes')
      const built = config.webpack?.({ mode: 'production', plugins: [] }, {
        isServer,
        dev: false,
        webpack: lib,
      } as never) as object
      const stats = await new Promise<CompiledStats>((resolve, reject) => {
        lib.webpack(
          {
            ...built,
            context: root,
            target: isServer ? 'node' : 'web',
            entry: path.join(hand, 'entry.js'),
            output: {
              path: path.join(root, 'out'),
              assetModuleFilename: 'media/[name].[hash][ext]',
            },
            optimization: { minimize: false },
          },
          (error, result) => (error || !result ? reject(error) : resolve(result)),
        )
      })
      expect(stats.hasErrors(), stats.toString({ errors: true })).toBe(false)
      return Object.keys(stats.compilation.assets)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }

  it("emits the tracker's files into the browser build", async () => {
    expect((await emitted(false)).filter((name) => name.endsWith('.task'))).toHaveLength(1)
  })

  it('emits none of them into the server build', async () => {
    expect((await emitted(true)).filter((name) => name.endsWith('.task'))).toEqual([])
  })
})
