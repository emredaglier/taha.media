import fs from 'node:fs'
import path from 'node:path'

import type { User } from '@taha/cms-config'
import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getAbout, getPrivacy, getSite } from './pages'
import { getFeaturedWorks, getPublishedWorkSlugs, getWorkBySlug, getWorks } from './works'

// The public instance: started without PREVIEW.
let site: TestSite
let editor: User

beforeAll(async () => {
  delete process.env.PREVIEW
  site = await createTestSite()
  Object.assign(process.env, site.webEnv)
  editor = await site.createEditor()
  const cover = await site.uploadImage(editor)
  const as = { user: editor, overrideAccess: false } as const
  await site.cms.create({
    collection: 'works',
    data: {
      title: 'Taslak',
      slug: 'taslak',
      disciplines: ['kurgu'],
      year: 2025,
      cover: cover.id,
      mainMedia: { kind: 'image', image: cover.id },
      featured: true,
    },
    draft: true,
    ...as,
  })
  for (const slug of ['site', 'about', 'privacy'] as const) {
    await site.cms.updateGlobal({ slug, data: {}, draft: true, ...as })
  }
}, 60_000)

afterAll(async () => {
  delete process.env.PREVIEW
  await site?.close()
})

const everyRead = async () => ({
  works: await getWorks(),
  featured: await getFeaturedWorks(),
  bySlug: await getWorkBySlug('taslak'),
  slugs: await getPublishedWorkSlugs(),
  site: await getSite(),
  about: await getAbout(),
  privacy: await getPrivacy(),
})

const nothingPublished = {
  works: [],
  featured: [],
  bySlug: { kind: 'notFound' },
  slugs: [],
  site: null,
  about: null,
  privacy: null,
}

describe('the public instance (no PREVIEW)', () => {
  it('reads no draft anywhere', async () => {
    expect(await everyRead()).toEqual(nothingPublished)
  })

  it('keeps reading no drafts when PREVIEW changes after startup: the instance reads it once', async () => {
    process.env.PREVIEW = '1'
    expect(await everyRead()).toEqual(nothingPublished)
  })

  it('takes no request input: the data module never touches headers, cookies or draft mode', () => {
    const dirs = [path.join(import.meta.dirname), path.join(import.meta.dirname, '../lib')]
    const sources = dirs.flatMap((dir) =>
      fs
        .readdirSync(dir)
        .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
        .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') })),
    )
    expect(sources.length).toBeGreaterThan(0)
    const offenders = sources
      .filter(({ text }) => /next\/headers|draftMode|cookies\(|headers\(|searchParams/.test(text))
      .map(({ name }) => name)
    expect(offenders).toEqual([])
  })
})
