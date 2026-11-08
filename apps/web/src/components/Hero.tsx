import type { Site } from '../data/pages'
import { copyrightNotice, OWNER_NAME } from '../lib/site'
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
 * when there is no loop, a plain block when there is neither). Over it, the name with © under it
 * bottom left and the Statement bottom right (left out when blank), then "watch with sound" when
 * the full-length Showreel link is set. Positions are wireframe placeholders until the owner's
 * design. It grows to fill the screen when nothing follows it (no Featured Works).
 */
export function Hero({ site }: { site: Site | null }) {
  const poster = site?.showreelPoster ?? site?.showreel?.poster ?? null
  const link = site?.showreelLink ?? null
  return (
    <section className="relative -mx-6 flex min-h-[80svh] flex-1 flex-col justify-end bg-background-raised">
      {site ? <HeroMedia site={site} /> : null}
      <div className="relative bg-background/60 px-6 py-8">
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
          <div className="mt-4">
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
