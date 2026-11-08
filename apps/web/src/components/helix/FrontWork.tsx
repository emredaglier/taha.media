import type { HelixWork } from '../FeaturedWorks'

/** The attribute on a static Home Work link that names its Work's slug, for the Helix to find. */
export const WORK_LINK_ATTRIBUTE = 'data-work-slug'

/**
 * Calls `onFocus(k, focused)` when keyboard or screen-reader focus enters (`true`) or leaves
 * (`false`) the static Home's link to Work `k`. Those links stay in the page while the Helix runs,
 * visually hidden, so Tab reaches each Work once, in the Editor's order. Returns the cleanup.
 */
export function watchWorkLinks(
  works: HelixWork[],
  onFocus: (work: number, focused: boolean) => void,
): () => void {
  const workOf = (target: EventTarget | null) => {
    const link = target instanceof Element ? target.closest(`[${WORK_LINK_ATTRIBUTE}]`) : null
    return link
      ? works.findIndex((work) => work.slug === link.getAttribute(WORK_LINK_ATTRIBUTE))
      : -1
  }
  const on = (focused: boolean) => (event: FocusEvent) => {
    const work = workOf(event.target)
    if (work >= 0) onFocus(work, focused)
  }
  const focusIn = on(true)
  const focusOut = on(false)
  document.addEventListener('focusin', focusIn)
  document.addEventListener('focusout', focusOut)
  return () => {
    document.removeEventListener('focusin', focusIn)
    document.removeEventListener('focusout', focusOut)
  }
}

/**
 * The front Work's overlay (wireframe positions until the owner's design). What it shows follows
 * the front at once. Screen readers get the Works from the static Home's links, once each, so the
 * visible text is hidden from them; instead a polite live region speaks the title and `k / n`
 * once each time the Helix comes to rest on a new Work (`announcement`, from the motion model's
 * `arrived`). `focused` is true while the static link of this front Work has focus: the overlay
 * then shows the focus ring (WCAG 2.4.7, 2.4.11), as the link itself is visually hidden.
 */
export function FrontWork({
  work,
  position,
  total,
  focused,
  announcement,
}: {
  work: HelixWork | undefined
  position: number
  total: number
  focused: boolean
  announcement: string
}) {
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      {work ? (
        <div
          aria-hidden="true"
          data-focused={focused ? '' : undefined}
          className="pointer-events-none absolute inset-x-6 bottom-6 flex items-end justify-between gap-6 pb-2 data-focused:outline-2 data-focused:outline-offset-4 data-focused:outline-current"
        >
          <div>
            <p className="font-serif text-4xl">{work.title}</p>
            <p className="mt-2 text-sm text-text-muted">
              {work.client ? `${work.disciplines} — ${work.client}` : work.disciplines}
            </p>
          </div>
          <p className="shrink-0 text-sm text-text-muted tabular-nums">
            {position} / {total}
          </p>
        </div>
      ) : null}
    </>
  )
}
