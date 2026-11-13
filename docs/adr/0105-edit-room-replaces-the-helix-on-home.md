# The Edit Room replaces the Helix on Home; Three.js on Home only; Hand control dropped

Status: accepted · 2026-11-13 · amends ADR-0101, ADR-0103 and ADR-0104

Home is the Edit Room, not the Helix. The Helix said nothing about who Taha is. The Edit Room shows his desk at night, with his first eight Featured Works playing on the screens he really works on (see the glossary and the Edit Room spec, #123). Three decisions go with it.

1. **The Edit Room replaces the Helix on Home.** Everything ADR-0103 says about the Helix holds for the room: Home is the Showreel and the room and nothing else, the page doesn't scroll, there is no footer, and visitors who get no motion get the static Home. The wheel moves the camera along a fixed path instead of turning a spiral.
2. **Three.js is allowed, on Home only.** ADR-0100 and ADR-0101 keep the rest of the site light. The room is its own chunk that only the Home mount loads, and only after the Home mode test says the device gets the room. Core Three.js only: no addons, loaders, controls or postprocessing. No other page and no static-Home visitor downloads it.
3. **Hand control is dropped.** The camera, its consent step and the 22 MB tracker served a trick few visitors used, and it was built around the Helix. It is removed from the site with the Helix, and Gizlilik no longer mentions a camera.

## Considered Options

- **Keep the Helix and add the room as a second Home**: rejected. Two Homes double the code and the static fallback has to match both.
- **Keep Hand control on the room**: rejected. The room's wheel, drag and pointer cover every Work, and a camera prompt on the first page of the site costs trust.
- **A video of the room instead of 3D**: rejected. The Works must play live on the screens and the camera must answer the visitor.

## Consequences

- The Helix and Hand control stay in the code until the room ships; their removal is the last ticket of the Edit Room run, and ADR-0103's and ADR-0104's mentions of the Helix read "Edit Room" from now on.
- The Home mode test and the loader's inline script must still agree.
- The admin says the room shows the first 8 Featured Works. Saving is never blocked by that number.
