import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Payload } from 'payload'
import sharp from 'sharp'

import type { Discipline } from '../disciplines'
import { slugify } from '../slugs'
import type { VideoUse } from '../video-limits'
import { findEditor, neverSaved } from './accounts'
import { lexical } from './lexical'

export const DEMO_EDITOR_EMAIL = 'demo@taha.media'
/** A local-only login for the demo database. The production seed never creates it. */
export const DEMO_EDITOR_PASSWORD = 'demo-password-1234'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/videos')

type MainMedia = { kind: 'video' } | { kind: 'external'; url: string } | { kind: 'image' }

type DemoWork = {
  title: string
  year: number
  disciplines: Discipline[]
  client?: string
  role?: string
  /** Position on Home; the Work is not featured when absent. */
  featuredOrder?: number
  /** A 16:9 loop; every featured Work needs one (ADR-0008, issue #43). */
  previewLoop?: boolean
  main: MainMedia
  stills?: number
}

const DEMO_WORKS: DemoWork[] = [
  {
    title: 'Kış Kampanyası',
    year: 2026,
    disciplines: ['kurgu', 'motion'],
    client: 'Nordic Giyim',
    role: 'Kurgu ve motion tasarım',
    featuredOrder: 0,
    previewLoop: true,
    main: { kind: 'video' },
    stills: 3,
  },
  {
    title: 'Şehrin Sesi',
    year: 2026,
    disciplines: ['kurgu'],
    client: 'Radyo İstanbul',
    role: 'Kurgu',
    featuredOrder: 1,
    previewLoop: true,
    main: { kind: 'external', url: 'https://vimeo.com/76979871' },
    stills: 2,
  },
  {
    title: 'Dalga Logo Animasyonu',
    year: 2025,
    disciplines: ['motion', 'grafik'],
    client: 'Dalga Kafe',
    role: 'Motion tasarım',
    featuredOrder: 2,
    previewLoop: true,
    main: { kind: 'image' },
  },
  {
    title: 'Kıyıdaki Işık',
    year: 2025,
    disciplines: ['kurgu'],
    client: 'Ege Turizm',
    featuredOrder: 3,
    previewLoop: true,
    main: { kind: 'external', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  },
  {
    title: 'Çarşı Afiş Serisi',
    year: 2025,
    disciplines: ['grafik'],
    client: 'Çarşı Festivali',
    role: 'Afiş tasarımı',
    featuredOrder: 4,
    previewLoop: true,
    main: { kind: 'image' },
    stills: 4,
  },
  {
    title: 'Ritim Başlık Jeneriği',
    year: 2024,
    disciplines: ['motion'],
    role: 'Başlık animasyonu',
    featuredOrder: 5,
    previewLoop: true,
    main: { kind: 'video' },
  },
  {
    title: 'Sessiz Sokaklar Belgeseli',
    year: 2024,
    disciplines: ['kurgu', 'grafik'],
    client: 'Anadolu Yapım',
    main: { kind: 'external', url: 'https://vimeo.com/76979871' },
    stills: 2,
  },
  {
    title: 'Mavi Saat Albüm Kapağı',
    year: 2024,
    disciplines: ['grafik'],
    role: 'Kapak tasarımı',
    main: { kind: 'image' },
  },
  {
    title: 'Tempo Spor Tanıtımı',
    year: 2023,
    disciplines: ['kurgu', 'motion'],
    client: 'Tempo Spor',
    previewLoop: true,
    main: { kind: 'video' },
  },
  {
    title: 'Pazar Kahvaltısı Reklamı',
    year: 2023,
    disciplines: ['kurgu'],
    client: 'Sabah Fırını',
    main: { kind: 'image' },
  },
]

const HUES = [
  '#7a5c3e',
  '#3e6a7a',
  '#7a3e5c',
  '#5c7a3e',
  '#3e4a7a',
  '#7a6f3e',
  '#6a3e7a',
  '#3e7a6a',
]

/**
 * The demo photos' width: wider than the largest srcset size (2560), so every demo image has its
 * own pixels at every size.
 */
const DEMO_PHOTO_WIDTH = 3000

type Seeder = {
  payload: Payload
  log: (message: string) => void
  photos: number
  photoWidth: number
}

/** A distinct 3:2 JPEG of the given width. */
async function demoPhoto(index: number, width: number): Promise<Buffer> {
  const height = Math.round((width * 2) / 3)
  const x = Math.round((width * (1 + (index % 8))) / 10)
  return sharp({
    create: { width, height, channels: 3, background: HUES[index % HUES.length]! },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}"><circle cx="${x}" cy="${height / 2}" r="${Math.round(height * 0.3)}" fill="white" fill-opacity="0.3"/></svg>`,
        ),
      },
    ])
    .jpeg()
    .toBuffer()
}

async function uploadImage(seeder: Seeder, alt: string): Promise<number> {
  seeder.photos += 1
  const data = await demoPhoto(seeder.photos, seeder.photoWidth)
  const image = await seeder.payload.create({
    collection: 'images',
    data: { alt },
    file: { data, mimetype: 'image/jpeg', name: `demo-${seeder.photos}.jpg`, size: data.length },
  })
  return image.id
}

async function uploadVideo(seeder: Seeder, use: VideoUse, fixture: string, alt: string) {
  const data = fs.readFileSync(path.join(FIXTURES, fixture))
  const poster = await uploadImage(seeder, `${alt} (video kapağı)`)
  const video = await seeder.payload.create({
    collection: 'videos',
    data: { use, poster },
    file: {
      data,
      mimetype: 'video/mp4',
      name: `demo-${use}-${seeder.photos}.mp4`,
      size: data.length,
    },
  })
  return video.id
}

const paragraph = (title: string) =>
  lexical([
    `${title} için hazırlanan çalışma; fikir aşamasından teslimata kadar tek elden yürütüldü.`,
    'Bu metin yerel demo veritabanı içindir ve istenildiği zaman değiştirilebilir.',
  ])

async function seedWork(seeder: Seeder, work: DemoWork): Promise<boolean> {
  const { payload, log } = seeder
  const slug = slugify({ valueToSlugify: work.title }) ?? ''
  const existing = await payload.find({
    collection: 'works',
    where: { slug: { equals: slug } },
    draft: true,
    limit: 1,
    depth: 0,
  })
  if (existing.totalDocs > 0) {
    log(`work ${slug}: exists`)
    return false
  }

  const cover = await uploadImage(seeder, `${work.title} kapak görseli`)
  const mainMedia =
    work.main.kind === 'video'
      ? {
          kind: 'video' as const,
          video: await uploadVideo(seeder, 'main', 'with-audio.mp4', work.title),
        }
      : work.main.kind === 'external'
        ? {
            kind: 'external' as const,
            externalUrl: work.main.url,
            externalPoster: await uploadImage(seeder, `${work.title} oynatıcı kapağı`),
          }
        : { kind: 'image' as const, image: await uploadImage(seeder, `${work.title} ana görsel`) }

  const stills = []
  for (let i = 1; i <= (work.stills ?? 0); i += 1) {
    stills.push({ image: await uploadImage(seeder, `${work.title} kare ${i}`) })
  }

  await payload.create({
    collection: 'works',
    data: {
      title: work.title,
      slug,
      year: work.year,
      disciplines: work.disciplines,
      client: work.client,
      role: work.role,
      credits: [{ name: 'Taha', role: work.role ?? 'Yönetmen' }],
      description: paragraph(work.title),
      featured: work.featuredOrder !== undefined,
      featuredOrder: work.featuredOrder,
      cover,
      mainMedia,
      previewLoop: work.previewLoop
        ? await uploadVideo(seeder, 'previewLoop', 'loop-ok.mp4', work.title)
        : undefined,
      stills,
      _status: 'published',
    },
  })
  log(`work ${slug}: created`)
  return true
}

/** The demo Gallery as the Galeri page shows it, top first (a loop among pictures). */
const DEMO_GALLERY: { kind: 'image' | 'loop'; caption?: string; year?: number }[] = [
  { kind: 'loop', caption: 'Setten bir döngü', year: 2025 },
  { kind: 'image', caption: 'İstanbul, sabah', year: 2025 },
  { kind: 'image', caption: 'Afiş çalışması', year: 2024 },
  { kind: 'image' },
]

/** Gallery items, only while the Gallery is empty, so a re-run never adds to it or reorders it. */
async function seedGallery(seeder: Seeder): Promise<void> {
  const { payload, log } = seeder
  if ((await payload.count({ collection: 'gallery' })).totalDocs > 0) {
    log('gallery: exists')
    return
  }
  // A Gallery loop left over from an earlier seed run is reused, not uploaded again.
  const leftover = await payload.find({
    collection: 'videos',
    where: { use: { equals: 'gallery' } },
    limit: 1,
    depth: 0,
    pagination: false,
  })
  const loop =
    leftover.docs[0]?.id ?? (await uploadVideo(seeder, 'gallery', 'loop-ok.mp4', 'Galeri döngüsü'))

  // A new item goes first, so the last one in the list is created first.
  for (const { kind, caption, year } of [...DEMO_GALLERY].reverse()) {
    await payload.create({
      collection: 'gallery',
      data:
        kind === 'loop'
          ? { kind, video: loop, caption, year }
          : { kind, image: await uploadImage(seeder, caption ?? 'Galeri görseli'), caption, year },
    })
  }
  log('gallery: created')
}

async function seedPages(seeder: Seeder): Promise<void> {
  const { payload, log } = seeder

  if (await neverSaved(payload, 'site')) {
    await payload.updateGlobal({
      slug: 'site',
      data: {
        showreel: await uploadVideo(seeder, 'showreel', 'loop-ok.mp4', 'Showreel'),
        showreelPhone: await uploadVideo(seeder, 'showreel', 'portrait.mp4', 'Showreel telefon'),
        showreelPoster: await uploadImage(seeder, 'Showreel görseli'),
        showreelLink: { url: 'https://vimeo.com/76979871' },
        statement: 'Kurgu, motion ve grafik tasarımla hikayeyi hareketle anlatıyorum.',
        email: 'merhaba@example.com',
        socials: [
          { platform: 'Instagram', url: 'https://instagram.com/example' },
          { platform: 'Vimeo', url: 'https://vimeo.com/example' },
        ],
        _status: 'published',
      },
    })
    log('site: created')
  } else log('site: exists')

  if (await neverSaved(payload, 'about')) {
    await payload.updateGlobal({
      slug: 'about',
      data: {
        portrait: await uploadImage(seeder, 'Taha portresi'),
        bio: lexical([
          'Merhaba, ben Taha. İstanbul merkezli bir video editörü, motion tasarımcı ve grafik tasarımcıyım.',
          'Markalarla ve yapımcılarla çalışıp fikirleri ekrana taşıyorum.',
        ]),
        disciplineLines: {
          kurgu: 'Ritmi ve akışı kuran kurgu.',
          motion: 'Grafiğe hareket kazandıran motion tasarım.',
          grafik: 'Markanın görsel dilini kuran grafik tasarım.',
        },
        clients: [{ name: 'Nordic Giyim' }, { name: 'Radyo İstanbul' }, { name: 'Dalga Kafe' }],
        _status: 'published',
      },
    })
    log('about: created')
  } else log('about: exists')

  if (await neverSaved(payload, 'privacy')) {
    await payload.updateGlobal({
      slug: 'privacy',
      data: {
        body: lexical([
          { heading: 'Gizlilik Politikası' },
          'Bu bir demo metnidir. Bu site ziyaretçilerden kişisel veri toplamaz.',
        ]),
        _status: 'published',
      },
    })
    log('privacy: created')
  } else log('privacy: exists')
}

/**
 * The local demo seed: Works of all three main-media kinds, several Disciplines, six featured
 * (the Edit Room shows up to 8), fixture images and videos within the caps, filled single-entry pages and a
 * demo Editor, so frontend work does not wait for content. Everything goes through the Local API
 * with validation on. Safe to run again: it only adds what is missing and never overwrites edits.
 *
 * It does not check the environment; the command that runs it does (`assertLocalEnvironment`).
 *
 * `photoWidth` shrinks the demo photos. Encoding every photo's WebP sizes is nearly all of the
 * seed's CPU time, so a test that checks what the seed creates, not the sizes, passes a small one.
 */
export async function seedLocal(
  payload: Payload,
  {
    log = () => undefined,
    photoWidth = DEMO_PHOTO_WIDTH,
  }: { log?: (message: string) => void; photoWidth?: number } = {},
): Promise<void> {
  const seeder: Seeder = { payload, log, photos: 0, photoWidth }

  if (await findEditor(payload, DEMO_EDITOR_EMAIL)) log('editor: exists')
  else {
    await payload.create({
      collection: 'users',
      data: { email: DEMO_EDITOR_EMAIL, password: DEMO_EDITOR_PASSWORD },
    })
    log(`editor ${DEMO_EDITOR_EMAIL}: created`)
  }

  for (const work of DEMO_WORKS) await seedWork(seeder, work)
  await seedPages(seeder)
  await seedGallery(seeder)
}
