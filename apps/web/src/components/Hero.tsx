import type { Site } from '../data/pages'
import { HERO_ATTRIBUTE, HERO_PHONE_ATTRIBUTE, HERO_TEXT_ATTRIBUTE } from '../lib/home-marks'
import { copyrightNotice, OWNER_NAME } from '../lib/site'
import { LoopVideo } from './LoopVideo'
import { Picture } from './Picture'

const SIZES = '100vw'
/** The phone variant shows below this width. */
const PHONE = 'min-[700px]:hidden'
const WIDE = 'max-[699px]:hidden'
/**
 * The hero's text the Helix draws into its picture (`HeroText`), so the CRT bend bends it: while
 * the Helix runs the page's text is see-through, still the page's heading for screen readers.
 */
const DRAWN_TEXT = { [HERO_TEXT_ATTRIBUTE]: '' }
const DRAWN = 'helix:opacity-0'

/**
 * What the Helix's Showreel layer needs (#54): the 16:9 loop (never the phone variant), and the
 * poster the static hero shows while the loop isn't playing, or instead of it when there is none.
 */
export type HelixShowreel = {
  video: { src: string; width: number; height: number } | null
  poster: {
    src: string
    srcset: string
    width: number
    height: number
    focalPoint: { x: number; y: number }
  } | null
}

export function toHelixShowreel(site: Site | null): HelixShowreel {
  const video = site?.showreel ?? null
  const poster = video ? video.poster : (site?.showreelPoster ?? null)
  return {
    video: video ? { src: video.src, width: video.width, height: video.height } : null,
    poster: poster
      ? {
          src: poster.src,
          srcset: poster.srcset,
          width: poster.width,
          height: poster.height,
          focalPoint: poster.focalPoint,
        }
      : null,
  }
}

function HeroMedia({ site }: { site: Site }) {
  const { showreel, showreelPhone, showreelPoster } = site
  if (showreel) {
    // Both variants are in the HTML; the one that doesn't fit is `display: none`, so its loop is
    // never in view and never plays.
    return (
      <>
        {showreelPhone ? (
          <div className={`absolute inset-0 ${PHONE}`} {...{ [HERO_PHONE_ATTRIBUTE]: '' }}>
            <LoopVideo video={showreelPhone} sizes={SIZES} fill />
          </div>
        ) : null}
        <div className={`absolute inset-0 ${showreelPhone ? WIDE : ''}`}>
          <LoopVideo video={showreel} sizes={SIZES} fill />
        </div>
      </>
    )
  }
  if (showreelPoster) {
    return (
      <Picture
        image={showreelPoster}
        sizes={SIZES}
        priority
        className="absolute inset-0 size-full object-cover"
      />
    )
  }
  return null
}

/**
 * The top of Home: the Showreel loop full-bleed, filling the screen under the header (the phone
 * variant on narrow screens, the poster when there is no loop, a plain block when there is
 * neither). Over it, the name with © under it bottom left and the Statement bottom right (left out
 * when blank).
 *
 * While the Helix runs (#54) this same hero is the opening's overlay: during the zoom it stays where
 * it is on screen (fixed, as the page scrolls under it), its media gives way to the Helix's
 * Showreel layer, which shows the same picture in the same place, and its text leaves with the
 * zoom (`--helix-hero-gone`, set by the Helix; the Helix draws the name, © and Statement itself,
 * so they bend with its picture, and the page's are see-through). From the melt on it is visually hidden, with only the name
 * left, the page's heading for screen readers (its controls are out of the tab order). The static
 * picture of the phone variant, which the Helix doesn't use, fades out over the Helix's first
 * frames instead of cutting (`--helix-handover-fade`). `data-home-hero` is how the Helix and the header
 * find it.
 */
export function Hero({ site }: { site: Site | null }) {
  return (
    <section
      {...{ [HERO_ATTRIBUTE]: '' }}
      className="relative -mx-6 flex min-h-svh flex-1 flex-col justify-end bg-background helix:bg-transparent helix-hero:fixed helix-hero:inset-0 helix-hero:z-[1] helix-hero:mx-0 helix-hero:[visibility:var(--helix-hero-visibility,visible)] helix-locked:sr-only helix-locked:min-h-0"
    >
      {site ? (
        // Out of sight once the Helix runs, at once, or fading out over `--helix-handover-fade`
        // when the static picture is the phone variant (the visibility flips at the fade's end).
        <div className="helix:invisible helix:opacity-0 [transition-duration:var(--helix-handover-fade,0ms)] [transition-property:opacity,visibility]">
          <HeroMedia site={site} />
        </div>
      ) : null}
      {/* The 16px slide is HERO_SLIDE_PX in helix/hero-text.ts: keep the two in step. */}
      {/* pb-20 holds the name's descenders and the © under it, clear of the screen's bent edge. */}
      <div className="relative px-12 pb-20 text-text mix-blend-difference helix-hero:[opacity:calc(1_-_var(--helix-hero-gone,0))] helix-hero:[translate:0_calc(var(--helix-hero-gone,0)*16px)]">
        {/* The name's baseline lines up with the Statement's last line; the © hangs below, out of the flow. */}
        <div className="flex flex-col gap-12 min-[700px]:flex-row min-[700px]:items-baseline-last min-[700px]:justify-between min-[700px]:gap-8">
          <div className="relative">
            <h1
              {...DRAWN_TEXT}
              className={`font-serif text-[clamp(2.75rem,7.5vw,7.5rem)] leading-[0.8] whitespace-nowrap ${DRAWN}`}
            >
              {OWNER_NAME}
            </h1>
            <p
              {...DRAWN_TEXT}
              className={`absolute top-full left-0 mt-3 font-sans text-xs whitespace-nowrap ${DRAWN}`}
            >
              {copyrightNotice()}
            </p>
          </div>
          {site?.statement ? (
            <p
              {...DRAWN_TEXT}
              className={`max-w-[11.2em] font-serif text-[clamp(1.75rem,2.9vw,2.75rem)] leading-[0.92] tracking-[-0.01em] ${DRAWN}`}
            >
              {site.statement}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
