/**
 * Cache tag names, shared by `cms` (which sends them on publish) and `web` (which tags its cached
 * reads with them, ADR-0012). Plain strings with no Payload imports, so `web` can import
 * `@taha/cms-config/tags` cheaply, including in the revalidate route.
 *
 * A Work's tag is keyed by its id, not its slug, so a slug change needs no old-slug tag: `web`
 * resolves a slug (current or old) to an id under the Works list tag, which every Work change
 * touches, and reads the Work itself under its own tag.
 */

/** One published Work's own data (its page). */
export const workTag = (id: number | string): string => `work:${id}`

/** Every list of Works: the Works page, slug lookups and the static params. */
export const WORKS_TAG = 'works'

/** Home's Featured Works (GLOSSARY: Featured Work). */
export const HOME_TAG = 'home'

/** The single-entry pages, by global slug. */
export type PageSlug = 'site' | 'about' | 'privacy'

/** One single-entry page (Site, About, Privacy). */
export const pageTag = (slug: PageSlug): string => `page:${slug}`

/** What the revalidate route accepts: our own tag shapes only. */
export const TAG_PATTERN = /^(?:works|home|work:\d+|page:(?:site|about|privacy))$/

/** A notification carries at most a handful of tags; anything bigger is not from `cms`. */
export const MAX_TAGS_PER_REQUEST = 20

/** Header carrying the shared secret on a revalidation request. */
export const REVALIDATE_SECRET_HEADER = 'x-revalidate-secret'
