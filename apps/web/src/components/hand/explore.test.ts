// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createExplorer, HAND_HOVER_ATTR } from './explore'

/*
 * The page under the hand: a card link (İşler's and Home's cards play their Preview loop on
 * `pointerenter`/`pointerleave` of the link, `LoopVideo`) with a picture inside, and the Helix's
 * canvas (`helix/pointer.ts` follows `pointermove` and `pointerleave` on it).
 */
let card: HTMLAnchorElement
let picture: HTMLDivElement
let canvas: HTMLCanvasElement
let log: string[]
/** What `document.elementFromPoint` would answer; jsdom has no layout. */
let under: Element | null

const TYPES = ['pointerover', 'pointerenter', 'pointermove', 'pointerout', 'pointerleave']

beforeEach(() => {
  document.body.innerHTML =
    '<main><a id="card" href="/isler/x"><div id="picture"></div></a><canvas id="helix"></canvas></main>'
  card = document.getElementById('card') as HTMLAnchorElement
  picture = document.getElementById('picture') as HTMLDivElement
  canvas = document.getElementById('helix') as HTMLCanvasElement
  log = []
  for (const element of [card, picture, canvas]) {
    for (const type of TYPES) {
      element.addEventListener(type, (event) => {
        if (event.currentTarget === event.target || !event.bubbles)
          log.push(`${type} ${element.id}`)
      })
    }
  }
  under = null
})

afterEach(() => {
  document.body.innerHTML = ''
})

const explorer = () => createExplorer(() => under)

describe('exploring with the hand', () => {
  it('enters the card under the cursor like a mouse, so its Preview loop plays', () => {
    const hand = explorer()
    under = picture
    hand.moveTo(40, 30)
    expect(log).toEqual([
      'pointerover picture',
      'pointerenter card',
      'pointerenter picture',
      'pointermove picture',
    ])
  })

  it('sends mouse-like pointer events at the cursor, which the Helix reads', () => {
    const hand = explorer()
    const moves: PointerEvent[] = []
    canvas.addEventListener('pointermove', (event) => moves.push(event))
    under = canvas
    hand.moveTo(120, 80)
    hand.moveTo(124, 82)
    expect(moves).toHaveLength(2)
    expect(moves[1]).toMatchObject({ clientX: 124, clientY: 82, pointerType: 'mouse' })
    expect(moves[1]!.isPrimary).toBe(true)
    expect(moves[1]!.bubbles).toBe(true)
  })

  it('leaves the card when the cursor moves on, so its loop pauses', () => {
    const hand = explorer()
    under = picture
    hand.moveTo(40, 30)
    log = []
    under = canvas
    hand.moveTo(300, 30)
    expect(log).toEqual([
      'pointerout picture',
      'pointerleave picture',
      'pointerleave card',
      'pointerover helix',
      'pointerenter helix',
      'pointermove helix',
    ])
  })

  it('marks the element under the cursor and its ancestors as hand-hovered, and only those', () => {
    const hand = explorer()
    under = picture
    hand.moveTo(40, 30)
    expect(picture.hasAttribute(HAND_HOVER_ATTR)).toBe(true)
    expect(card.hasAttribute(HAND_HOVER_ATTR)).toBe(true)
    expect(canvas.hasAttribute(HAND_HOVER_ATTR)).toBe(false)
    under = canvas
    hand.moveTo(300, 30)
    expect(picture.hasAttribute(HAND_HOVER_ATTR)).toBe(false)
    expect(card.hasAttribute(HAND_HOVER_ATTR)).toBe(false)
    expect(canvas.hasAttribute(HAND_HOVER_ATTR)).toBe(true)
    expect(document.querySelector('main')!.hasAttribute(HAND_HOVER_ATTR)).toBe(true)
  })

  it('leaves everything when tracking is lost or Hand control stops', () => {
    const hand = explorer()
    under = picture
    hand.moveTo(40, 30)
    log = []
    hand.release()
    expect(log).toEqual(['pointerout picture', 'pointerleave picture', 'pointerleave card'])
    expect(document.querySelectorAll(`[${HAND_HOVER_ATTR}]`)).toHaveLength(0)
    hand.release()
    expect(log).toHaveLength(3)
  })

  it('sends nothing over empty space', () => {
    explorer().moveTo(10, 10)
    expect(log).toEqual([])
  })
})

describe('clicking with the hand', () => {
  const CLICK_TYPES = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']
  /** Every press, release and click that reaches `element`, with its target and where. */
  const listen = (element: Element) => {
    const heard: string[] = []
    for (const type of CLICK_TYPES) {
      element.addEventListener(type, (event) => {
        const { clientX, clientY } = event as MouseEvent
        heard.push(`${type} ${(event.target as Element).id} ${clientX},${clientY}`)
      })
    }
    return heard
  }

  it('presses, releases and clicks what is under the cursor, as a mouse does, once', () => {
    const heard = listen(card)
    const hand = explorer()
    under = picture
    hand.moveTo(40, 30)
    hand.click()
    expect(heard).toEqual(CLICK_TYPES.map((type) => `${type} picture 40,30`))
  })

  it('focuses what a mouse click would focus: the link around the picture', () => {
    const hand = explorer()
    under = picture
    hand.moveTo(40, 30)
    let focusedOnRelease: Element | null = null
    card.addEventListener('pointerup', () => (focusedOnRelease = document.activeElement))
    hand.click()
    // Focus moves between the press and the release, as it does for a mouse.
    expect(focusedOnRelease).toBe(card)
    expect(document.activeElement).toBe(card)
  })

  it('takes focus away when it clicks something unfocusable, as a mouse does', () => {
    card.focus()
    const hand = explorer()
    under = canvas
    hand.moveTo(300, 30)
    hand.click()
    expect(document.activeElement).toBe(document.body)
  })

  it('a press the page cancels sends no mouse press and moves no focus, but still clicks', () => {
    const heard = listen(card)
    picture.addEventListener('pointerdown', (event) => event.preventDefault())
    const hand = explorer()
    under = picture
    hand.moveTo(40, 30)
    hand.click()
    expect(heard.map((line) => line.split(' ')[0])).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(document.activeElement).toBe(document.body)
  })

  it('clicks nothing over empty space, or once tracking is lost', () => {
    const heard = listen(card)
    const hand = explorer()
    hand.click()
    under = picture
    hand.moveTo(40, 30)
    hand.release()
    hand.click()
    expect(heard).toEqual([])
  })
})
