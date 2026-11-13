/**
 * The marks Home's static markup and the Helix find each other by (#53, #54). The CSS in
 * `globals.css` keys to the same hero attribute as a literal (`[data-home-hero]`): Tailwind reads
 * it as plain text, so keep the two spellings in step.
 */

/** The attribute on the static hero (an empty value). */
export const HERO_ATTRIBUTE = 'data-home-hero'

/** Selects the static hero. */
export const HERO_SELECTOR = `[${HERO_ATTRIBUTE}]`

/** The attribute on the static hero's phone variant of the Showreel (the Helix doesn't use it). */
export const HERO_PHONE_ATTRIBUTE = 'data-home-hero-phone'

/** The attribute on a static Home Work link that names its Work's slug, for the Helix to find. */
export const WORK_LINK_ATTRIBUTE = 'data-work-slug'

/**
 * The attribute on the hero's name, © line and Statement: the text the Helix draws into its own
 * picture, while the page's text stays for screen readers.
 */
export const HERO_TEXT_ATTRIBUTE = 'data-home-hero-text'

/** Selects the hero's text the Helix draws. */
export const HERO_TEXT_SELECTOR = `[${HERO_TEXT_ATTRIBUTE}]`

/** The attribute on the hero's Statement, which the Edit Room reads to draw it on its sheet (#128). */
export const STATEMENT_ATTRIBUTE = 'data-home-statement'

/** Selects the hero's Statement. */
export const STATEMENT_SELECTOR = `[${STATEMENT_ATTRIBUTE}]`
