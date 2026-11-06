# A fixed quality floor; motion and 3D are enhancements on top

Status: accepted

The site is meant to look mid-heavy, with possible 3D and scroll-driven interaction later. Every page must still meet a floor that no effect may break:

- WCAG 2.2 AA.
- Content readable without JavaScript.
- Works in Safari and on iOS.

Motion, 3D and autoplaying video are layered on top. They turn off under `prefers-reduced-motion`, Save-Data or a weak device, and a static poster takes their place. Following daglier.com's ADR-0008, nothing is hidden waiting for an animation unless JS has marked the page as able to play it.

## Consequences

Every 3D or scroll effect needs a designed static fallback. The Figma designs show each page's resting state first.
