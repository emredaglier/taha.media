import { describe, expect, it } from 'vitest'

import { loadCompose } from './compose-config'
import { read } from './test-helpers.ts'

// Repo guards (CODING_STANDARDS: "Repo guards scan source on purpose"): the Dockerfile is only
// built by the release gate, so these pin the rules that a build alone would not notice.
const dockerfile = read('Dockerfile')

/** The instructions of one build stage (`FROM ... AS name` up to the next FROM). */
function stage(name: string): string {
  const match = new RegExp(`^FROM .* AS ${name}\\n([\\s\\S]*?)(?=^FROM |(?![\\s\\S]))`, 'm').exec(
    dockerfile,
  )
  if (!match) throw new Error(`no stage ${name}`)
  return match[1]!
}

describe('Dockerfile', () => {
  it('has one stage for each image the Compose file runs', () => {
    const compose = loadCompose('compose.yaml')
    const images = Object.values(compose.services)
      .map((service) => /\/(web|cms|migrate):\$\{RELEASE/.exec(service.image ?? '')?.[1])
      .filter(Boolean)
    expect(new Set(images)).toEqual(new Set(['web', 'cms', 'migrate']))
    for (const target of ['web', 'cms', 'migrate']) expect(stage(target)).toBeTruthy()
  })

  it('runs every image as the app user, uid 10001, the user Litestream and the data folder expect', () => {
    for (const target of ['web', 'cms', 'migrate'])
      expect(stage(target), target).toMatch(/^USER app$/m)
    expect(stage('runtime')).toContain('--uid 10001')
    expect(loadCompose('compose.yaml').services.litestream?.user).toBe('10001:10001')
  })

  it('keeps the package manager out of the runtime images', () => {
    const runtime = stage('runtime')
    expect(runtime).toMatch(/COPY --from=base \/usr\/local\/bin\/node/)
    expect(runtime).not.toMatch(/npm install|corepack|pnpm/)
  })

  it('copies every patched dependency before installing, so the image is built patched', () => {
    const deps = stage('deps')
    const patches = /^patchedDependencies:\n((?:  .+\n?)+)/m.exec(read('pnpm-workspace.yaml'))
    expect(patches, 'pnpm-workspace.yaml lists patchedDependencies').not.toBeNull()
    // Every patch lives in `patches/`, the folder the deps stage copies.
    const files = [...patches![1]!.matchAll(/: (\S+)$/gm)].map((match) => match[1]!)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(file).toMatch(/^patches\//)
      expect(read(file).length, file).toBeGreaterThan(0)
    }
    const copy = deps.indexOf('COPY patches patches')
    expect(copy).toBeGreaterThan(-1)
    expect(copy).toBeLessThan(deps.indexOf('pnpm install'))
  })

  it('takes the CDN prefix and deployment id as build arguments (ADR-0005)', () => {
    const build = stage('build')
    expect(build).toMatch(/^ARG ASSET_PREFIX=""$/m)
    expect(build).toMatch(/^ARG DEPLOYMENT_ID=""$/m)
    expect(build).toMatch(/ENV ASSET_PREFIX=\$\{ASSET_PREFIX\} DEPLOYMENT_ID=\$\{DEPLOYMENT_ID\}/)
    expect(build).toMatch(/^ENV NEXT_STANDALONE=1$/m)
  })

  it('copies the libsql native binding next to the traced packages of both servers', () => {
    const build = stage('build')
    expect(build).toMatch(/for app in web cms/)
    expect(build).toMatch(/@libsql\+linux-\*/)
  })

  it('builds cms with a real Next build, since its package `build` script is only a typecheck', () => {
    expect(JSON.parse(read('apps/cms/package.json')).scripts.build).toBe('tsc --noEmit')
    expect(stage('build')).toMatch(/--filter @taha\/cms exec next build/)
  })

  it('does not bake secrets into any stage other than throwaway build settings', () => {
    expect(dockerfile).not.toMatch(/REVALIDATE_SECRET|S3_SECRET|SEED_/)
    expect(stage('runtime') + stage('web') + stage('cms') + stage('migrate')).not.toMatch(/SECRET/)
  })

  it('pins the same Node and pnpm versions as the repo', () => {
    expect(dockerfile).toContain(`ARG NODE_VERSION=${read('.node-version').trim()}`)
    const pnpm = /"packageManager": "pnpm@([\d.]+)/.exec(read('package.json'))?.[1]
    expect(dockerfile).toContain(`pnpm@${pnpm}`)
  })

  it('ships the migrate image its config and the production seed, and nothing from the demo seed', () => {
    const migrate = stage('migrate-files')
    expect(migrate).toMatch(/pnpm --filter @taha\/cms-config deploy --prod/)
    expect(migrate).toContain('infra/migrate/payload.config.ts')
    expect(migrate).toContain('infra/migrate/seed-production.ts')
    expect(migrate).not.toMatch(/seed\.ts/)
    expect(stage('migrate')).toMatch(/CMD \["node", "node_modules\/payload\/bin\.js", "migrate"\]/)
  })
})
