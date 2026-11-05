import {
  DISCIPLINES,
  resolveSeo,
  richTextToPlainText,
  toImage,
  toVideo,
  type AboutDoc,
  type Discipline,
  type ImageDoc,
  type ImageRead,
  type PrivacyDoc,
  type Seo,
  type SiteDoc,
  type VideoDoc,
  type VideoRead,
} from '@taha/cms-config'

import { getWebPayload } from '../lib/payload'

/** Rich text as a Lexical editor state; the frontend renders it. */
type RichText = NonNullable<AboutDoc['bio']>

/** Page titles used when SEO has no override (the pages' own names). */
const SITE_TITLE = 'taha.media'
const ABOUT_TITLE = 'Hakkımda'
const PRIVACY_TITLE = 'Gizlilik'

export type Site = {
  /** The silent Showreel loop; null until the Editor sets it. */
  showreel: VideoRead | null
  /** Smaller variant for phones; null when none was set. */
  showreelPhone: VideoRead | null
  showreelPoster: ImageRead | null
  /** The full-length Showreel on Vimeo or YouTube; null when not set. */
  showreelLink: { provider: 'vimeo' | 'youtube'; id: string; url: string } | null
  intro: string | null
  email: string | null
  /** In the order the Editor set. */
  socials: { platform: string; url: string }[]
  /** Overrides when set, otherwise the site name, the intro line and the Showreel poster. */
  seo: Seo<ImageRead>
}

export type About = {
  portrait: ImageRead | null
  bio: RichText | null
  /** One line per Discipline that has one, in Discipline order. */
  disciplineLines: { discipline: Discipline; line: string }[]
  /** In the order the Editor set; the logo is optional. */
  clients: { name: string; logo: ImageRead | null }[]
  /** Overrides when set, otherwise the page title, the start of the bio and the portrait. */
  seo: Seo<ImageRead>
}

export type Privacy = {
  /** Paragraphs, bold, italic, links, H2/H3 and lists; null when empty. */
  body: RichText | null
  /** Overrides when set, otherwise the page title and the start of the body; no image. */
  seo: Seo<ImageRead>
}

/**
 * Published versions only, with access rules applied (the Local API skips them by default; with no
 * user, the read rule only matches published documents). `draft: false` reads the published
 * version even when a newer draft exists.
 */
const PUBLISHED = { draft: false, overrideAccess: false, depth: 2 } as const

const image = (value: unknown): ImageRead | null =>
  typeof value === 'object' && value !== null ? toImage(value as ImageDoc) : null

const video = (value: unknown): VideoRead | null =>
  typeof value === 'object' && value !== null ? toVideo(value as VideoDoc) : null

const text = (value: string | null | undefined): string | null => value?.trim() || null

const richText = <T>(value: T | null | undefined): T | null =>
  value && richTextToPlainText(value) !== '' ? value : null

/**
 * A global that was never published reads as not found: the Local API answers with an empty
 * document, so a missing `_status` means nothing is published yet.
 */
async function readGlobal<T extends 'site' | 'about' | 'privacy'>(slug: T) {
  const payload = await getWebPayload()
  const doc = await payload.findGlobal({ slug, ...PUBLISHED })
  return doc._status === 'published' ? doc : null
}

export async function getSite(): Promise<Site | null> {
  const doc = await readGlobal('site')
  if (!doc) return null
  const showreelPoster = image(doc.showreelPoster)
  const link = doc.showreelLink
  return {
    showreel: video(doc.showreel),
    showreelPhone: video(doc.showreelPhone),
    showreelPoster,
    showreelLink:
      link?.provider && link.videoId && link.url
        ? { provider: link.provider, id: link.videoId, url: link.url }
        : null,
    intro: text(doc.intro),
    email: text(doc.email),
    socials: (doc.socials ?? []).map(({ platform, url }) => ({ platform, url })),
    seo: resolveSeo({
      overrides: doc.seo,
      title: SITE_TITLE,
      description: plainParagraph(doc.intro),
      fallbackImage: showreelPoster,
      toImage,
    }),
  }
}

export async function getAbout(): Promise<About | null> {
  const doc = await readGlobal('about')
  if (!doc) return null
  const portrait = image(doc.portrait)
  return {
    portrait,
    bio: richText(doc.bio),
    disciplineLines: DISCIPLINES.flatMap((discipline) => {
      const line = text(doc.disciplineLines?.[discipline])
      return line ? [{ discipline, line }] : []
    }),
    clients: (doc.clients ?? []).map(({ name, logo }) => ({ name, logo: image(logo) })),
    seo: resolveSeo({
      overrides: doc.seo,
      title: ABOUT_TITLE,
      description: doc.bio,
      fallbackImage: portrait,
      toImage,
    }),
  }
}

export async function getPrivacy(): Promise<Privacy | null> {
  const doc = await readGlobal('privacy')
  if (!doc) return null
  return {
    body: richText(doc.body),
    seo: resolveSeo({
      overrides: doc.seo,
      title: PRIVACY_TITLE,
      description: doc.body,
      fallbackImage: null,
      toImage,
    }),
  }
}

/** A plain string as a one-paragraph editor state, so `resolveSeo` can excerpt it. */
function plainParagraph(value: string | null | undefined) {
  return {
    root: { type: 'root', children: [{ type: 'paragraph', children: [{ text: value ?? '' }] }] },
  }
}

export type { PrivacyDoc, SiteDoc }
