import fs from 'node:fs'

/**
 * What the seeded smoke database holds, written by `pnpm --filter @taha/cms smoke:prepare`
 * (packages/cms-config/src/seed/smoke.ts) and read here, so the spec's expectations come from the
 * data and never from constants. The shape is checked on every read: a missing or half-written
 * manifest stops the run instead of letting the gate pass on less than it should check.
 */
export type SmokeManifest = {
  works: { slug: string; title: string; featured: boolean }[]
  draft: { slug: string; title: string }
  renamed: { oldSlug: string; newSlug: string; title: string }
  liveEdit: { slug: string; title: string; newTitle: string }
  about: { text: string }
  privacy: { text: string }
}

const fail = (reason: string): never => {
  throw new Error(`Invalid smoke manifest: ${reason}. Run \`pnpm smoke\`, which writes it.`)
}
const text = (value: unknown, name: string): string =>
  typeof value === 'string' && value.trim() !== '' ? value : fail(`${name} is empty`)

export function parseManifest(raw: unknown): SmokeManifest {
  const m = raw as Partial<SmokeManifest> | null
  if (typeof m !== 'object' || m === null) return fail('not an object')
  if (!Array.isArray(m.works) || m.works.length === 0) return fail('no published Works')
  const works = m.works.map((work, index) => ({
    slug: text(work?.slug, `works[${index}].slug`),
    title: text(work?.title, `works[${index}].title`),
    featured: work?.featured === true,
  }))
  if (!works.some((work) => work.featured)) return fail('no featured Work')
  const slugs = new Set(works.map((work) => work.slug))

  const draft = {
    slug: text(m.draft?.slug, 'draft.slug'),
    title: text(m.draft?.title, 'draft.title'),
  }
  if (slugs.has(draft.slug)) fail('the draft Work is published')

  const renamed = {
    oldSlug: text(m.renamed?.oldSlug, 'renamed.oldSlug'),
    newSlug: text(m.renamed?.newSlug, 'renamed.newSlug'),
    title: text(m.renamed?.title, 'renamed.title'),
  }
  if (renamed.oldSlug === renamed.newSlug) fail('the renamed Work kept its slug')
  if (!slugs.has(renamed.newSlug) || slugs.has(renamed.oldSlug)) {
    fail('the renamed Work is not published under its new slug only')
  }

  const liveEdit = {
    slug: text(m.liveEdit?.slug, 'liveEdit.slug'),
    title: text(m.liveEdit?.title, 'liveEdit.title'),
    newTitle: text(m.liveEdit?.newTitle, 'liveEdit.newTitle'),
  }
  if (!works.some((work) => work.slug === liveEdit.slug && work.featured)) {
    fail('the live-edit Work is not a featured Work')
  }
  if (liveEdit.newTitle === liveEdit.title) fail('the live edit changes nothing')

  return {
    works,
    draft,
    renamed,
    liveEdit,
    about: { text: text(m.about?.text, 'about.text') },
    privacy: { text: text(m.privacy?.text, 'privacy.text') },
  }
}

export const readManifest = (file: string): SmokeManifest =>
  parseManifest(JSON.parse(fs.readFileSync(file, 'utf8')))

/** The title a Work shows once the live edit has run (`pnpm smoke` runs it before the browser). */
export const expectedTitle = (
  manifest: SmokeManifest,
  work: { slug: string; title: string },
): string => (work.slug === manifest.liveEdit.slug ? manifest.liveEdit.newTitle : work.title)

export type PublicRoute = {
  path: string
  /** Text the page must show (a Work's title, the start of the About or Privacy text). */
  text?: string
  /** Home only: the title of every Featured Work. */
  featuredTitles?: string[]
}

/** Every public route of the site, with what must be on it. */
export function publicRoutes(manifest: SmokeManifest): PublicRoute[] {
  return [
    {
      path: '/',
      featuredTitles: manifest.works
        .filter((work) => work.featured)
        .map((work) => expectedTitle(manifest, work)),
    },
    { path: '/hakkimda', text: manifest.about.text },
    { path: '/gizlilik', text: manifest.privacy.text },
    ...manifest.works.map((work) => ({
      path: `/isler/${work.slug}`,
      text: expectedTitle(manifest, work),
    })),
  ]
}
