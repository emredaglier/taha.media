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
 * Set on `<html>` while the hero's overlays have left (the zoom has taken them away, the melt has
 * started): a click-to-load player opened in the hero closes then.
 */
export const HERO_GONE_ATTRIBUTE = 'data-helix-hero-gone'
