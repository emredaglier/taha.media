import type { Site } from '../data/pages'
import { HERO_ATTRIBUTE, STATEMENT_ATTRIBUTE } from '../lib/home-marks'
import { copyrightNotice, OWNER_NAME } from '../lib/site'
import { LoopVideo } from './LoopVideo'
import { Picture } from './Picture'

const SIZES = '100vw'
/** The phone variant shows below this width. */
const PHONE = 'min-[700px]:hidden'
const WIDE = 'max-[699px]:hidden'
function HeroMedia({ site }: { site: Site }) {
  const { showreel, showreelPhone, showreelPoster } = site
  if (showreel) {
    // Both variants are in the HTML; the one that doesn't fit is `display: none`, so its loop is
    // never in view and never plays.
    return (
      <>
        {showreelPhone ? (
          <div className={`absolute inset-0 ${PHONE}`}>
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
 * While the Edit Room runs, this hero is visually hidden, with only the name left, the page's
 * heading for screen readers; the room draws the Showreel and the Statement itself (it reads the
 * Statement from `data-home-statement`). `data-home-hero` is how the header finds it.
 */
export function Hero({ site }: { site: Site | null }) {
  return (
    <section
      {...{ [HERO_ATTRIBUTE]: '' }}
      className="relative -mx-6 flex min-h-svh flex-1 flex-col justify-end bg-background room:bg-transparent room:sr-only room:min-h-0"
    >
      {site ? (
        // Out of sight once the room runs.
        <div className="room:invisible room:opacity-0">
          <HeroMedia site={site} />
        </div>
      ) : null}
      {/* pb-20 holds the name's descenders and the © under it, clear of the screen's bent edge. */}
      <div className="relative px-12 pb-20 text-text mix-blend-difference">
        {/* The name's baseline lines up with the Statement's last line; the © hangs below, out of the flow. */}
        <div className="flex flex-col gap-12 min-[700px]:flex-row min-[700px]:items-baseline-last min-[700px]:justify-between min-[700px]:gap-8">
          <div className="relative">
            <h1 className="font-serif text-[clamp(2.75rem,7.5vw,7.5rem)] leading-[0.8] whitespace-nowrap">
              {OWNER_NAME}
            </h1>
            <p className="absolute top-full left-0 mt-3 font-sans text-xs whitespace-nowrap">
              {copyrightNotice()}
            </p>
          </div>
          {site?.statement ? (
            <p
              {...{ [STATEMENT_ATTRIBUTE]: '' }}
              className="max-w-[11.2em] font-serif text-[clamp(1.75rem,2.9vw,2.75rem)] leading-[0.92] tracking-[-0.01em]"
            >
              {site.statement}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
