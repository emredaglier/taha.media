import type { Site } from '../data/pages'
import { OWNER_NAME } from '../lib/site'
import { LoopVideo } from './LoopVideo'
import { Picture } from './Picture'
import { WatchWithSound } from './WatchWithSound'

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
 * The top of Home: the Showreel loop full-bleed (the phone variant on narrow screens, the poster
 * when there is no loop, a plain block when there is neither), with the name and the Site intro
 * over it, and "watch with sound" when the full-length Showreel link is set.
 */
export function Hero({ site }: { site: Site | null }) {
  const poster = site?.showreelPoster ?? site?.showreel?.poster ?? null
  const link = site?.showreelLink ?? null
  return (
    <section className="relative -mx-6 flex min-h-[80svh] flex-col justify-end bg-background-raised">
      {site ? <HeroMedia site={site} /> : null}
      <div className="relative bg-background/60 px-6 py-8">
        <h1 className="font-serif text-5xl">{OWNER_NAME}</h1>
        {site?.intro ? <p className="mt-4 max-w-xl text-lg">{site.intro}</p> : null}
        {link && poster ? (
          <div className="mt-4">
            <WatchWithSound provider={link.provider} id={link.id} url={link.url} poster={poster} />
          </div>
        ) : null}
      </div>
    </section>
  )
}
