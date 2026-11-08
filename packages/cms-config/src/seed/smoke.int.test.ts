import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FEATURED_MAX, FEATURED_MIN } from '../featured'
import { createTestSite, type TestSite } from '../testing'
import { seedLocal } from './local'
import { applyLiveEdit, prepareSmokeContent, type SmokeManifest } from './smoke'

// The release gate's content (spec #1, Seam 2): the demo seed plus what only a smoke run needs,
// written the way the admin writes it. The browser spec reads the manifest instead of restating
// the seed, so a seed edit never breaks the gate by itself.
let site: TestSite
let manifest: SmokeManifest

beforeAll(async () => {
  site = await createTestSite({ objectStorage: false })
  await seedLocal(site.cms)
  manifest = await prepareSmokeContent(site.cms)
}, 120_000)

afterAll(async () => {
  await site?.close()
})

const publishedWorks = () =>
  site.cms.find({
    collection: 'works',
    draft: false,
    overrideAccess: false,
    limit: 100,
    depth: 0,
  })

describe('prepareSmokeContent', () => {
  it('lists exactly the published Works, under the slugs the site serves them at', async () => {
    const { docs } = await publishedWorks()
    expect(manifest.works.map((w) => w.slug).sort()).toEqual(docs.map((w) => w.slug).sort())
    expect(manifest.works.length).toBeGreaterThanOrEqual(8)
    for (const work of manifest.works) {
      expect(docs.find((d) => d.slug === work.slug)?.title).toBe(work.title)
    }
    const featuredCount = manifest.works.filter((w) => w.featured).length
    expect(featuredCount).toBeGreaterThanOrEqual(FEATURED_MIN)
    expect(featuredCount).toBeLessThanOrEqual(FEATURED_MAX)
  })

  it('adds a Work that was never published: not served publicly, but there for the preview', async () => {
    expect(manifest.works.map((w) => w.slug)).not.toContain(manifest.draft.slug)
    const { docs } = await publishedWorks()
    expect(docs.map((w) => w.slug)).not.toContain(manifest.draft.slug)
    const { docs: latest } = await site.cms.find({
      collection: 'works',
      draft: true,
      where: { slug: { equals: manifest.draft.slug } },
      overrideAccess: true,
    })
    expect(latest).toHaveLength(1)
    expect(latest[0]?.title).toBe(manifest.draft.title)
  })

  it('renames a published Work so its old address has to redirect', async () => {
    const { oldSlug, newSlug } = manifest.renamed
    expect(newSlug).not.toBe(oldSlug)
    expect(manifest.works.map((w) => w.slug)).toContain(newSlug)
    expect(manifest.works.map((w) => w.slug)).not.toContain(oldSlug)
    const { docs } = await publishedWorks()
    expect(docs.find((w) => w.slug === newSlug)?.previousSlugs).toContain(oldSlug)
  })

  it('picks the live-edit Work among the featured ones, which is where Home shows it', () => {
    const target = manifest.works.find((w) => w.slug === manifest.liveEdit.slug)
    expect(target?.featured).toBe(true)
    expect(manifest.liveEdit.newTitle).not.toBe(target?.title)
  })

  it('quotes text of the published About and Privacy pages', () => {
    expect(manifest.about.text.length).toBeGreaterThan(10)
    expect(manifest.privacy.text.length).toBeGreaterThan(5)
  })

  it('is plain JSON, so the spec can read it from a file', () => {
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest)
  })
})

describe('applyLiveEdit', () => {
  it('publishes the new title and tells web which tags to refresh, Home included', async () => {
    site.revalidations.length = 0
    await applyLiveEdit(site.cms, manifest)
    const { docs } = await publishedWorks()
    expect(docs.find((w) => w.slug === manifest.liveEdit.slug)?.title).toBe(
      manifest.liveEdit.newTitle,
    )
    const tags = site.revalidations.flat()
    expect(tags).toContain('works')
    expect(tags).toContain('home')
    expect(tags.some((tag) => tag.startsWith('work:'))).toBe(true)
  })
})
