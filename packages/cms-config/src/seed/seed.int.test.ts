import { handleEndpoints } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FEATURED_MAX, FEATURED_MIN } from '../featured'
import { isSixteenByNine } from '../featured-loop'
import { createTestSite, type TestSite } from '../testing'
import { VIDEO_USES } from '../video-limits'
import { lexical } from './lexical'
import { DEMO_EDITOR_EMAIL, DEMO_EDITOR_PASSWORD, seedLocal } from './local'
import { seedProduction } from './production'
import { resetPassword } from './reset-password'

let site: TestSite

beforeAll(async () => {
  site = await createTestSite({ objectStorage: false })
}, 30_000)

afterAll(async () => {
  await site?.close()
})

const counts = async () => ({
  works: (await site.cms.count({ collection: 'works' })).totalDocs,
  images: (await site.cms.count({ collection: 'images' })).totalDocs,
  videos: (await site.cms.count({ collection: 'videos' })).totalDocs,
  users: (await site.cms.count({ collection: 'users' })).totalDocs,
  gallery: (await site.cms.count({ collection: 'gallery' })).totalDocs,
})

describe('the local seed', () => {
  it('fills published Works of all three main-media kinds, Disciplines and 6-12 featured', async () => {
    await seedLocal(site.cms)

    const { docs: works } = await site.cms.find({ collection: 'works', limit: 100, depth: 1 })
    expect(works.length).toBeGreaterThanOrEqual(8)
    expect(new Set(works.map((w) => w.mainMedia?.kind))).toEqual(
      new Set(['video', 'external', 'image']),
    )
    expect(new Set(works.flatMap((w) => w.disciplines)).size).toBeGreaterThanOrEqual(3)
    expect(works.every((w) => w._status === 'published')).toBe(true)
    const featured = works.filter((w) => w.featured)
    expect(featured.length).toBeGreaterThanOrEqual(FEATURED_MIN)
    expect(featured.length).toBeLessThanOrEqual(FEATURED_MAX)
    expect(works.every((w) => typeof w.cover === 'object' && w.cover !== null)).toBe(true)
    expect(works.some((w) => w.previewLoop)).toBe(true)
    for (const work of featured) {
      const loop = work.previewLoop
      expect(
        typeof loop === 'object' && loop !== null && isSixteenByNine(loop.width!, loop.height!),
      ).toBe(true)
    }
  }, 60_000)

  it('uploads Videos of every use (the caps accepted them)', async () => {
    const { docs } = await site.cms.find({ collection: 'videos', limit: 100 })
    const uses = new Set(docs.map((v) => v.use))
    for (const use of VIDEO_USES) expect(uses.has(use)).toBe(true)
  })

  it('fills and publishes the single-entry pages', async () => {
    const siteDoc = await site.cms.findGlobal({ slug: 'site' })
    expect(siteDoc._status).toBe('published')
    expect(siteDoc.statement).toBeTruthy()
    expect(siteDoc.email).toBeTruthy()
    expect(siteDoc.showreel).toBeTruthy()
    expect(siteDoc.socials?.length).toBeGreaterThan(0)
    const about = await site.cms.findGlobal({ slug: 'about' })
    expect(about._status).toBe('published')
    expect(about.bio).toBeTruthy()
    expect(about.disciplineLines?.kurgu).toBeTruthy()
    expect(about.clients?.length).toBeGreaterThan(0)
    const privacy = await site.cms.findGlobal({ slug: 'privacy' })
    expect(privacy._status).toBe('published')
    expect(privacy.body).toBeTruthy()
  })

  it('fills the Gallery with image items and a loop, newest first', async () => {
    const { docs } = await site.cms.find({
      collection: 'gallery',
      sort: '_order',
      limit: 100,
      depth: 1,
    })
    expect(docs.length).toBeGreaterThanOrEqual(3)
    // The loop is the first demo item: created last, so it shows on top.
    expect(docs[0]?.kind).toBe('loop')
    expect(typeof docs[0]?.video).toBe('object')
    expect(docs.filter((item) => item.kind === 'image').length).toBeGreaterThanOrEqual(2)
    expect(docs.some((item) => item.caption)).toBe(true)
  })

  it('creates a demo Editor that can sign in', async () => {
    const { token } = await site.cms.login({
      collection: 'users',
      data: { email: DEMO_EDITOR_EMAIL, password: DEMO_EDITOR_PASSWORD },
    })
    expect(token).toBeTruthy()
  })

  it('is idempotent: a second run adds nothing and keeps edits', async () => {
    const work = (await site.cms.find({ collection: 'works', limit: 1 })).docs[0]!
    await site.cms.update({ collection: 'works', id: work.id, data: { client: 'Düzenlendi' } })
    const before = await counts()
    await seedLocal(site.cms)
    expect(await counts()).toEqual(before)
    const after = await site.cms.findByID({ collection: 'works', id: work.id })
    expect(after.client).toBe('Düzenlendi')
  }, 60_000)
})

describe('the production seed', () => {
  const accounts = [
    { email: 'dev@example.com', password: 'dev-password-1234' },
    { email: 'taha@example.com', password: 'taha-password-1234' },
  ]

  it('creates exactly the two Editors, empty Site and About, and a draft Privacy text', async () => {
    const prod = await createTestSite({ objectStorage: false })
    try {
      await seedProduction(prod.cms, { accounts })

      const { docs: users } = await prod.cms.find({ collection: 'users' })
      expect(users.map((u) => u.email).sort()).toEqual(['dev@example.com', 'taha@example.com'])
      await expect(
        prod.cms.login({
          collection: 'users',
          data: { email: 'taha@example.com', password: 'taha-password-1234' },
        }),
      ).resolves.toMatchObject({ token: expect.any(String) })

      for (const collection of ['works', 'images', 'videos', 'gallery'] as const) {
        expect((await prod.cms.count({ collection })).totalDocs).toBe(0)
      }

      const siteDoc = await prod.cms.findGlobal({ slug: 'site' })
      expect(siteDoc._status).toBe('published')
      expect(siteDoc.statement).toBeFalsy()
      expect(siteDoc.showreel).toBeFalsy()
      expect(siteDoc.socials ?? []).toHaveLength(0)
      const about = await prod.cms.findGlobal({ slug: 'about' })
      expect(about._status).toBe('published')
      expect(about.bio).toBeFalsy()

      const privacy = await prod.cms.findGlobal({ slug: 'privacy', draft: true })
      expect(privacy._status).toBe('draft')
      expect(JSON.stringify(privacy.body)).toContain('Gizlilik')
      // Visitors see no Privacy text until Taha publishes it.
      const visitor = await prod.cms.findGlobal({ slug: 'privacy', overrideAccess: false })
      expect(visitor.body).toBeFalsy()

      // Running it again changes nothing: not an edited Privacy draft, not a changed password.
      await prod.cms.updateGlobal({
        slug: 'privacy',
        draft: true,
        data: { body: lexical(['Taha yazdı.']), _status: 'draft' },
      })
      await resetPassword(prod.cms, 'taha@example.com', 'changed-password-1234')
      await seedProduction(prod.cms, { accounts })
      expect((await prod.cms.count({ collection: 'users' })).totalDocs).toBe(2)
      const kept = await prod.cms.findGlobal({ slug: 'privacy', draft: true })
      expect(JSON.stringify(kept.body)).toContain('Taha yazdı.')
      await expect(
        prod.cms.login({
          collection: 'users',
          data: { email: 'taha@example.com', password: 'changed-password-1234' },
        }),
      ).resolves.toBeTruthy()
    } finally {
      await prod.close()
    }
  }, 30_000)

  it('refuses accounts it cannot create: not exactly two, or a short password', async () => {
    await expect(seedProduction(site.cms, { accounts: [accounts[0]!] })).rejects.toThrow(/two/i)
    await expect(
      seedProduction(site.cms, {
        accounts: [accounts[0]!, { email: 'x@example.com', password: 'short' }],
      }),
    ).rejects.toThrow(/password/i)
  })
})

describe('resetting a password', () => {
  it('changes the password of an existing Editor', async () => {
    await site.createEditor({ email: 'reset@example.com', password: 'old-password-1234' })
    await resetPassword(site.cms, 'reset@example.com', 'new-password-1234')
    await expect(
      site.cms.login({
        collection: 'users',
        data: { email: 'reset@example.com', password: 'old-password-1234' },
      }),
    ).rejects.toThrow()
    await expect(
      site.cms.login({
        collection: 'users',
        data: { email: 'reset@example.com', password: 'new-password-1234' },
      }),
    ).resolves.toBeTruthy()
  })

  it('also unlocks an account locked by failed logins', async () => {
    await site.createEditor({ email: 'locked@example.com', password: 'old-password-1234' })
    for (let i = 0; i < 6; i++) {
      await site.cms
        .login({ collection: 'users', data: { email: 'locked@example.com', password: 'wrong' } })
        .catch(() => undefined)
    }
    await resetPassword(site.cms, 'locked@example.com', 'new-password-1234')
    await expect(
      site.cms.login({
        collection: 'users',
        data: { email: 'locked@example.com', password: 'new-password-1234' },
      }),
    ).resolves.toBeTruthy()
  })

  it('fails clearly for an unknown email, creating nobody', async () => {
    const before = (await site.cms.count({ collection: 'users' })).totalDocs
    await expect(
      resetPassword(site.cms, 'nobody@example.com', 'new-password-1234'),
    ).rejects.toThrow(/nobody@example\.com/)
    expect((await site.cms.count({ collection: 'users' })).totalDocs).toBe(before)
  })

  it('refuses a password that is too short', async () => {
    await expect(resetPassword(site.cms, 'reset@example.com', 'short')).rejects.toThrow(/password/i)
  })
})

// ADR-0013: cms sends no email, so the admin offers no way to ask for a reset link.
describe('forgot password is off', () => {
  it('registers an admin component that hides the login-screen link', () => {
    const after = site.cms.config.admin.components.afterLogin ?? []
    expect(JSON.stringify(after)).toContain('hide-forgot-password')
  })

  it('refuses the forgot-password API and sends nothing', async () => {
    await site.createEditor({ email: 'forgot@example.com' })
    const sent: unknown[] = []
    const email = await site.cms.email
    const original = email.sendEmail
    email.sendEmail = async (message) => {
      sent.push(message)
    }
    try {
      const response = await handleEndpoints({
        config: Promise.resolve(site.cms.config),
        request: new Request('http://localhost/api/users/forgot-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'forgot@example.com' }),
        }),
      })
      expect(response.status).toBe(404)
    } finally {
      email.sendEmail = original
    }
    expect(sent).toHaveLength(0)
    // No transport that delivers: Payload's default adapter would be SMTP/Resend, this only logs.
    expect(email.name).toBe('console')
  })
})
