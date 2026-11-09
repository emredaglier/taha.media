/**
 * The hand-hover marker: set on the element under the hand's cursor and on its ancestors, so CSS
 * can match it where it matches `:hover` (the `hand-hover:` and `group-hand-hover:` variants in
 * `globals.css`; CSS can't import this, so keep the two spellings in step).
 */
export const HAND_HOVER_ATTR = 'data-hand-hover'

/** The hand's pointer id: any id no mouse, pen or finger uses. */
const HAND_POINTER_ID = 7001

/** The element and its ancestors, innermost first. */
const ancestry = (element: Element | null): Element[] => {
  const chain: Element[] = []
  for (let at = element; at; at = at.parentElement) chain.push(at)
  return chain
}

/**
 * Explores the page with the hand's cursor (#56): at each move it sends the element under the
 * cursor the pointer events a mouse would cause (`pointerover`, `pointerenter`, `pointermove`,
 * `pointerout`, `pointerleave`, in the browser's order, with `pointerType: 'mouse'` so existing
 * hover code accepts them), and moves the hand-hover marker along. `hitTest` answers which element
 * is at a point (client px), leaving out the ring and the preview. Mouse and keyboard are untouched.
 */
export function createExplorer(hitTest: (x: number, y: number) => Element | null) {
  let target: Element | null = null
  let chain: Element[] = []
  let at = { x: 0, y: 0 }

  const fire = (element: Element, type: string, bubbles: boolean, related: Element | null) => {
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles,
        cancelable: type !== 'pointerenter' && type !== 'pointerleave',
        composed: true,
        clientX: at.x,
        clientY: at.y,
        pointerId: HAND_POINTER_ID,
        pointerType: 'mouse',
        isPrimary: true,
        relatedTarget: related,
      }),
    )
  }

  /** Moves the hover from the current target to `next` (null: nowhere). */
  const hover = (next: Element | null) => {
    if (next === target) return
    const nextChain = ancestry(next)
    const kept = new Set(nextChain)
    if (target) {
      fire(target, 'pointerout', true, next)
      for (const element of chain) {
        if (kept.has(element)) continue
        element.removeAttribute(HAND_HOVER_ATTR)
        fire(element, 'pointerleave', false, next)
      }
    }
    const previous = target
    const before = new Set(chain)
    target = next
    chain = nextChain
    if (next) {
      fire(next, 'pointerover', true, previous)
      for (const element of [...nextChain].reverse()) {
        if (before.has(element)) continue
        element.setAttribute(HAND_HOVER_ATTR, '')
        fire(element, 'pointerenter', false, previous)
      }
    }
  }

  return {
    /** The cursor is at (x, y) in client px. */
    moveTo(x: number, y: number) {
      at = { x, y }
      hover(hitTest(x, y))
      if (target) fire(target, 'pointermove', true, null)
    },

    /** The cursor is gone (tracking lost, or Hand control stopped): leave whatever it was over. */
    release() {
      hover(null)
    },
  }
}

export type Explorer = ReturnType<typeof createExplorer>
