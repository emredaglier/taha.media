# Home shows a loader until the Helix's hero is ready

Status: accepted · 2026-11-13 · amends ADR-0101

The Helix draws the hero's name, © and Statement into its own picture (WebGL), and the flat server-rendered hero can't match that exactly, so handing over from it would show. Instead, on Home and only on a device that will get the Helix, a black screen with the TAHA mark covers the page until the Helix's first frame is drawn (the Showreel layer, the glyph atlas and the hero's text ready), and it turns on like an old TV, then fades out to the Helix's hero. The loader hides the hand-over.

This amends ADR-0101's rule that nothing is hidden waiting for JavaScript, for this one case, under these limits:

- An inline script in the root layout's head puts it up (`html.is-loading`) before the first paint, only on Home and only when the device passes the same test as the Helix (no reduced motion, no Save-Data, WebGL2, not a weak device). Without JavaScript, under reduced motion, on a weak device or on any other page, it never shows. A client-side navigation to Home doesn't show it either.
- The same script takes it off after 4 seconds whatever happens, so a slow video or a Helix that never starts can't trap a visitor. The Helix takes it off at once when it gives up.
- It is decoration: hidden from screen readers, never clickable and never focusable. The page stays in the tree under it.

## Considered Options

- **Keep the visible hand-over from the flat hero**: rejected by the owner.
- **Hide the page with CSS until the Helix runs**: rejected. A visitor whose Helix never starts would see nothing.

## Consequences

- While the Helix runs, the page's hero text is see-through but stays the page's heading for screen readers; "Sesli izle" stays a flat page control.
- The loader's test and the Helix's (`chooseHomeMode`) must agree; a unit test holds them together.
