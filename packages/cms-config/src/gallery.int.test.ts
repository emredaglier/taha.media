import { createLocalReq } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { User } from './payload-types'
import { createTestSite, type TestSite } from './testing'

let site: TestSite
let editor: User
let imageId: number
let loopId: number

beforeAll(async () => {
  site = await createTestSite()
  editor = await site.createEditor()
  imageId = (await site.uploadImage(editor)).id
  loopId = (await site.uploadVideo(editor, { use: 'gallery' })).id
}, 60_000)

afterAll(async () => {
  await site?.close()
})

beforeEach(async () => {
  await site.cms.delete({ collection: 'gallery', where: { id: { exists: true } } })
  site.revalidations.length = 0
})

const as = { overrideAccess: false } as const

/** Saves a Gallery item as the Editor does in the admin. */
const save = (data: Record<string, unknown>) =>
  site.cms.create({
    collection: 'gallery',
    data: data as never,
    user: editor,
    ...as,
  })

const image = (extra: Record<string, unknown> = {}) =>
  save({ kind: 'image', image: imageId, ...extra })

/** The message the Editor reads. */
const refusal = async (promise: Promise<unknown>): Promise<string> => {
  const error = (await promise.then(
    () => {
      throw new Error('Expected the save to be refused.')
    },
    (e: unknown) => e,
  )) as { data?: { errors?: { message: string }[] }; message: string }
  return error.data?.errors?.map((e) => e.message).join(' | ') ?? error.message
}

/** The Editor's order: ascending position keys, as the site reads them. */
const order = async () =>
  (
    await site.cms.find({
      collection: 'gallery',
      sort: '_order',
      limit: 0,
      pagination: false,
      depth: 0,
    })
  ).docs.map((doc) => doc.caption)

/** Swaps the position keys of two items, as a drag in the admin list does (inside `req`, if any). */
async function swap(a: number, b: number, req?: Awaited<ReturnType<typeof createLocalReq>>) {
  const keyOf = async (id: number) =>
    (await site.cms.findByID({ collection: 'gallery', id, depth: 0 }))._order
  const [keyA, keyB] = [await keyOf(a), await keyOf(b)]
  await site.cms.update({
    collection: 'gallery',
    id: a,
    data: { _order: keyB },
    ...(req && { req }),
  })
  await site.cms.update({
    collection: 'gallery',
    id: b,
    data: { _order: keyA },
    ...(req && { req }),
  })
}

describe('a Gallery item', () => {
  it('saves an image item with its Image, caption and year', async () => {
    const item = await image({ caption: 'Sabah ışığı', year: 2024 })
    expect(item).toMatchObject({
      kind: 'image',
      caption: 'Sabah ışığı',
      year: 2024,
      image: { id: imageId },
    })
  })

  it('saves a loop item with its Video, and no caption or year', async () => {
    const item = await save({ kind: 'loop', video: loopId })
    expect(item).toMatchObject({ kind: 'loop', video: { id: loopId } })
    expect(item.caption ?? null).toBeNull()
    expect(item.year ?? null).toBeNull()
  })

  it('is refused when the matching field is empty, in Turkish', async () => {
    expect(await refusal(save({ kind: 'image' }))).toBe('Görsel öğesi için bir görsel seçin.')
    expect(await refusal(save({ kind: 'loop' }))).toBe('Döngü öğesi için bir video seçin.')
  })

  it('is refused when the other field is filled too, in Turkish', async () => {
    expect(await refusal(save({ kind: 'image', image: imageId, video: loopId }))).toBe(
      'Görsel öğesinde video olamaz; videoyu kaldırın.',
    )
    expect(await refusal(save({ kind: 'loop', video: loopId, image: imageId }))).toBe(
      'Döngü öğesinde görsel olamaz; görseli kaldırın.',
    )
  })

  it('keeps the rule when only the kind changes', async () => {
    const item = await image()
    const message = await refusal(
      site.cms.update({
        collection: 'gallery',
        id: item.id,
        data: { kind: 'loop' },
        user: editor,
        ...as,
      }),
    )
    expect(message).toBe(
      'Döngü öğesi için bir video seçin. | Döngü öğesinde görsel olamaz; görseli kaldırın.',
    )
  })

  it('takes only a Video of the gallery use', async () => {
    const preview = await site.uploadVideo(editor, { use: 'previewLoop' })
    expect(await refusal(save({ kind: 'loop', video: preview.id }))).toBe(
      'Video yalnızca “Galeri döngüsü” kullanımlı bir video olabilir.',
    )
  })

  it('takes a year from 1990 to this year, nothing else', async () => {
    const thisYear = new Date().getFullYear()
    expect((await image({ year: 1990 })).year).toBe(1990)
    expect((await image({ year: thisYear })).year).toBe(thisYear)
    const message = (value: number) => refusal(image({ year: value }))
    expect(await message(1989)).toBe('Yıl 1990 ile bu yıl arasında bir tam sayı olmalı.')
    expect(await message(thisYear + 1)).toBe('Yıl 1990 ile bu yıl arasında bir tam sayı olmalı.')
    expect(await message(2020.5)).toBe('Yıl 1990 ile bu yıl arasında bir tam sayı olmalı.')
  })

  it('is readable by anyone, and written only by an Editor', async () => {
    const item = await image({ caption: 'Herkese açık' })
    const read = await site.cms.findByID({
      collection: 'gallery',
      id: item.id,
      overrideAccess: false,
    })
    expect(read.caption).toBe('Herkese açık')
    await expect(
      site.cms.create({
        collection: 'gallery',
        data: { kind: 'image', image: imageId } as never,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})

describe('the Gallery order', () => {
  it('puts a new item first', async () => {
    await image({ caption: 'A' })
    await image({ caption: 'B' })
    await image({ caption: 'C' })
    expect(await order()).toEqual(['C', 'B', 'A'])
  })

  it('follows a drag: the items trade their position keys', async () => {
    const a = await image({ caption: 'A' })
    await image({ caption: 'B' })
    const c = await image({ caption: 'C' })
    // C is first and A last.
    await swap(a.id, c.id)
    expect(await order()).toEqual(['A', 'B', 'C'])
  })

  it('puts a new item first even after a drag', async () => {
    const a = await image({ caption: 'A' })
    const b = await image({ caption: 'B' })
    await swap(a.id, b.id)
    expect(await order()).toEqual(['A', 'B'])
    await image({ caption: 'Yeni' })
    expect(await order()).toEqual(['Yeni', 'A', 'B'])
  })
})

describe('the Gallery tag', () => {
  const sent = () => site.revalidations.map((tags) => [...tags].sort())

  it('is the only tag a create, a change and a delete send', async () => {
    const item = await image({ caption: 'Etiket' })
    expect(sent()).toEqual([['gallery']])
    site.revalidations.length = 0
    await site.cms.update({
      collection: 'gallery',
      id: item.id,
      data: { caption: 'Değişti' },
      user: editor,
      ...as,
    })
    expect(sent()).toEqual([['gallery']])
    site.revalidations.length = 0
    await site.cms.delete({ collection: 'gallery', id: item.id, user: editor, ...as })
    expect(sent()).toEqual([['gallery']])
  })

  it('sends it once when one request moves several items', async () => {
    const a = await image({ caption: 'A' })
    await image({ caption: 'B' })
    const c = await image({ caption: 'C' })
    site.revalidations.length = 0
    // The admin's drag endpoint updates every moved item inside one request.
    await swap(a.id, c.id, await createLocalReq({ user: editor }, site.cms))
    expect(await order()).toEqual(['A', 'B', 'C'])
    expect(sent()).toEqual([['gallery']])
  })

  it('is sent again by the next request', async () => {
    const item = await image()
    site.revalidations.length = 0
    await site.cms.update({
      collection: 'gallery',
      id: item.id,
      data: { year: 2021 },
      user: editor,
      ...as,
    })
    await site.cms.update({
      collection: 'gallery',
      id: item.id,
      data: { year: 2022 },
      user: editor,
      ...as,
    })
    expect(sent()).toEqual([['gallery'], ['gallery']])
  })
})
