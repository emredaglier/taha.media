# Home holds the screen: no page scroll after the Helix, no footer, a static fallback

Status: accepted · 2026-11-08 · stays in force; ADR-0105: where it says "Helix", read "Edit Room"

Home is the Showreel and the Helix, and nothing else. Scrolling drives only the zoom from the full-bleed Showreel out to the Helix. Once the Showreel has melted away (the point of no return), the page stops scrolling: the wheel, a drag and the arrow keys turn the Helix, endlessly in both directions. The logo or a reload brings the Showreel back. Nothing follows the Helix, so Home has no footer. Gizlilik and © are in the menu instead, and every other page keeps the footer.

Visitors who get no motion get a static Home instead: under reduced motion or Save-Data, on a weak device, without WebGL2 or without JavaScript. It shows the hero (name, Statement, ©, the Showreel or its poster), then the Featured Works as plain cards. This static Home is also the server HTML every visitor gets first, and the Helix is built on top of it (ADR-0101).

## Considered Options

- **Keep the FLOW below the Helix** (statement section, A/B/C cards, short About): rejected. The wheel can't both turn an endless Helix and scroll on to content after it, so anything below the Helix would be unreachable or would break the endless turn.
- **Pin the Helix inside a normal scrolling page**: rejected for the same reason. At some point the wheel would have to hand over from turning to page scroll, and that handover fights the card settling the owner approved in the prototype.
- **A footer on Home**: rejected. With no page scroll there is nowhere to put it, and the menu already reaches Gizlilik.

## Consequences

- Taking over the wheel is deliberate, and limited to Home after the melt. Keyboard and screen-reader users get the same Works: the real Featured Works stay in the page as links, arrow keys turn the Helix, Enter opens the front Work, and focusing a Work brings it to the front.
- The menu gains the Gizlilik link and ©. The footer is rendered on every route except Home, including the not-found page.
- The static Home is a designed page, not a broken Helix. It is what the owner checks first for phones without the Helix, reduced motion and no JavaScript.
- Coming back from a Work page restores the Helix with the same Work in front and skips the Showreel. The URL doesn't change per card.
- The FLOW's Home parts no longer apply: the statement section with the reel inside it, the A/B/C Featured cards, the short About and the "Tüm işler" link.
