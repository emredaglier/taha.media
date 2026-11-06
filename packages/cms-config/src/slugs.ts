import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook } from 'payload'

// Mapped before lower-casing: 'İ'.toLowerCase() leaves a combining dot, and 'I' must become 'i'.
const TURKISH: Record<string, string> = {
  ş: 's',
  Ş: 's',
  ı: 'i',
  I: 'i',
  İ: 'i',
  ğ: 'g',
  Ğ: 'g',
  ç: 'c',
  Ç: 'c',
  ö: 'o',
  Ö: 'o',
  ü: 'u',
  Ü: 'u',
}

/**
 * URL slug from free text: Turkish letters transliterated, other accents stripped, lowercase,
 * runs of anything else collapsed to one hyphen, none at the ends. Used by the Work slug field
 * for generated and typed slugs alike. Returns undefined for no input.
 */
export function slugify({ valueToSlugify }: { valueToSlugify?: unknown }): string | undefined {
  if (typeof valueToSlugify !== 'string') return undefined
  return valueToSlugify
    .replace(/[şŞıIİğĞçÇöÖüÜ]/g, (letter) => TURKISH[letter] ?? letter)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * `beforeValidate` hook for Works. A typed slug is cleaned like a generated one. A new Work saved
 * without a slug (a seed, a script) gets one from its title: Payload's own slug hook runs after
 * validation, which would refuse a published save for the missing slug (the admin form fills the
 * slug in the browser).
 */
export const cleanSlug: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (!data) return data
  if (data.slug) return { ...data, slug: slugify({ valueToSlugify: data.slug }) }
  if (operation === 'create') return { ...data, slug: slugify({ valueToSlugify: data.title }) }
  return data
}

/**
 * `beforeChange` hook for Works: publishing a changed slug leaves the old one in `previousSlugs`
 * so its URL can redirect. Only the published slug counts: a draft's slug was never a live URL,
 * and draft edits of a published Work leave the trail alone until they are published. The
 * published slug is read from the published version, since `originalDoc` is the latest draft.
 */
export const recordPreviousSlugs: CollectionBeforeChangeHook = async ({
  collection,
  data,
  operation,
  originalDoc,
  req,
}) => {
  const slug: string | undefined = data.slug ?? originalDoc?.slug
  const previous: string[] = data.previousSlugs ?? originalDoc?.previousSlugs ?? []
  const list = [...previous]
  if (operation === 'update' && data._status === 'published' && originalDoc?.id) {
    const live = await req.payload.findByID({
      collection: collection.slug as 'works',
      id: originalDoc.id,
      draft: false,
      depth: 0,
      req,
    })
    if (live._status === 'published' && live.slug && live.slug !== slug) list.push(live.slug)
  }
  return { ...data, previousSlugs: [...new Set(list)].filter((entry) => entry !== slug) }
}
