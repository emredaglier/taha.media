# Home shows a loader until the Edit Room's first frame

Status: accepted · 2026-11-13 · amends ADR-0101 · re-pointed from the Helix's hero to the Edit Room by ADR-0105

The Edit Room is a WebGL scene, and the flat server-rendered Home can't match its first frame exactly, so handing over from it would show. Instead, on Home and only on a device that will get the Edit Room, a black screen with the TAHA mark covers the page until the room's first frame is drawn (the Showreel on the middle monitor ready), and it turns on like an old TV, then fades out to the room. The loader hides the hand-over.

This amends ADR-0101's rule that nothing is hidden waiting for JavaScript, for this one case, under these limits:

- An inline script in the root layout's head puts it up (`html.is-loading`) before the first paint, only on Home and only when the device passes the same test as the Edit Room (no reduced motion, no Save-Data, WebGL2, not a weak device). Without JavaScript, under reduced motion, on a weak device or on any other page, it never shows. A client-side navigation to Home doesn't show it either.
- The same script takes it off after 4 seconds whatever happens, so a slow video or a room that never starts can't trap a visitor. The Edit Room takes it off at once when it gives up.
- It is decoration: hidden from screen readers, never clickable and never focusable. The page stays in the tree under it.

## Considered Options

- **Keep the visible hand-over from the flat hero**: rejected by the owner.
- **Hide the page with CSS until the Edit Room runs**: rejected. A visitor whose room never starts would see nothing.

## Consequences

- While the Edit Room runs, the Statement and the Featured Works stay real text and links in the page for screen readers; "Sesli izle" stays a flat page control.
- The loader's test and the Edit Room's (`chooseHomeMode`) must agree; a unit test holds them together.
