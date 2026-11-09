import type { Site } from '../data/pages'
import { HERO_ATTRIBUTE, HERO_PHONE_ATTRIBUTE } from '../lib/home-marks'
import { copyrightNotice, OWNER_NAME } from '../lib/site'
import { LoopVideo } from './LoopVideo'
import { Picture } from './Picture'
import { WatchWithSound } from './WatchWithSound'

const SIZES = '100vw'
/** The phone variant shows below this width. */
const PHONE = 'min-[700px]:hidden'
const WIDE = 'max-[699px]:hidden'

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
 * when blank), then "watch with sound" when the full-length Showreel link is set. Positions are
 * wireframe placeholders until the owner's design.
 *
 * While the Helix runs (#54) this same hero is the opening's overlay: during the zoom it stays where
 * it is on screen (fixed, as the page scrolls under it), its media gives way to the Helix's
 * Showreel layer, which shows the same picture in the same place, and its text leaves with the
 * zoom (`--helix-hero-gone`, set by the Helix). From the melt on it is visually hidden, with only the name
 * left, the page's heading for screen readers (its controls are out of the tab order). The static
 * picture of the phone variant, which the Helix doesn't use, fades out over the Helix's first
 * frames instead of cutting (`--helix-handover-fade`). `data-home-hero` is how the Helix and the header
 * find it.
 */
export function Hero({ site }: { site: Site | null }) {
  const poster = site?.showreelPoster ?? site?.showreel?.poster ?? null
  const link = site?.showreelLink ?? null
  return (
    <section
      {...{ [HERO_ATTRIBUTE]: '' }}
      className="relative -mx-6 flex min-h-svh flex-1 flex-col justify-end bg-background-raised helix:bg-transparent helix-hero:fixed helix-hero:inset-0 helix-hero:z-[1] helix-hero:mx-0 helix-hero:[visibility:var(--helix-hero-visibility,visible)] helix-locked:sr-only helix-locked:min-h-0"
    >
      {site ? (
        // Out of sight once the Helix runs, at once, or fading out over `--helix-handover-fade`
        // when the static picture is the phone variant (the visibility flips at the fade's end).
        <div className="helix:invisible helix:opacity-0 [transition-duration:var(--helix-handover-fade,0ms)] [transition-property:opacity,visibility]">
          <HeroMedia site={site} />
        </div>
      ) : null}
      <div className="relative bg-background/60 px-6 py-8 helix-hero:[opacity:calc(1_-_var(--helix-hero-gone,0))] helix-hero:[translate:0_calc(var(--helix-hero-gone,0)*16px)]">
        <div className="flex flex-col gap-6 min-[700px]:flex-row min-[700px]:items-end min-[700px]:justify-between">
          <div>
            <h1 className="font-serif text-5xl">{OWNER_NAME}</h1>
            <p className="mt-2 text-sm">{copyrightNotice()}</p>
          </div>
          {site?.statement ? (
            <p className="max-w-xl text-lg min-[700px]:text-right">{site.statement}</p>
          ) : null}
        </div>
        {link ? (
          // Nothing to see or reach once the hero is hidden for screen readers (the melt on): the
          // link would be an invisible Tab stop. The heading stays.
          <div className="mt-4 helix-locked:invisible">
            {poster ? (
              <WatchWithSound
                provider={link.provider}
                id={link.id}
                url={link.url}
                poster={poster}
              />
            ) : (
              // The click-to-load player needs our own poster; without one it is a plain link.
              <a href={link.url} className="underline">
                Sesli izle
              </a>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
