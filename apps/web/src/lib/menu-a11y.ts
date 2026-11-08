/** The id of the menu's full-screen panel. */
export const MENU_PANEL_ID = 'site-menu-panel'

/**
 * Whether the menu is open: its `<details>` is, natively before hydration and from SiteMenu's
 * state after. The Helix ignores input while it is.
 */
export const isMenuOpen = (document: Document): boolean =>
  document.getElementById(MENU_PANEL_ID)?.closest('details')?.open === true

/** Scroll lock for the open menu: `overflow: hidden` on the root. Returns the undo. */
export const lockScroll = (html: HTMLElement): (() => void) => {
  const before = html.style.overflow
  html.style.overflow = 'hidden'
  return () => {
    html.style.overflow = before
  }
}

/**
 * Focus trap: where Tab should go, or null if there is nothing to focus. `focusables` is the
 * trap's tabbable elements in order (the toggle button included). It picks every step, not only
 * the wrap at the ends: Safari's Tab skips links by default, so left to the browser it would jump
 * from a link to whatever else on the page takes focus (copied from daglier.com, ADR-0100).
 */
export const nextFocus = <T>(
  focusables: readonly T[],
  active: T | null,
  shift: boolean,
): T | null => {
  const count = focusables.length
  if (count === 0) return null
  const index = active === null ? -1 : focusables.indexOf(active)
  if (index === -1) return focusables[shift ? count - 1 : 0]!
  return focusables[(index + (shift ? count - 1 : 1)) % count]!
}
