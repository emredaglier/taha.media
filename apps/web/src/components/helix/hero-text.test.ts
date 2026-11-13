import { describe, expect, it } from 'vitest'

import { HERO_SLIDE_PX, wordPlacement, wordsOf } from './hero-text'

describe('wordsOf: the hero text is drawn a word at a time, where the page laid each out', () => {
  it('finds each run of letters and where it is in the text', () => {
    expect(wordsOf('  Taha  Çiftçi\n')).toEqual([
      { word: 'Taha', start: 2, end: 6 },
      { word: 'Çiftçi', start: 8, end: 14 },
    ])
  })

  it('finds none in blank text', () => {
    expect(wordsOf('')).toEqual([])
    expect(wordsOf(' \n\t ')).toEqual([])
  })
})

describe('wordPlacement: where a word goes in the texture, which covers the canvas', () => {
  const box = { left: 0, top: 0 }

  it('puts the baseline the font ascent below the top of the word box', () => {
    expect(wordPlacement({ left: 32, top: 600 }, box, 90, 0)).toEqual({ x: 32, y: 690 })
  })

  it('measures from the canvas, wherever it is on the page', () => {
    const moved = wordPlacement({ left: 52, top: 640 }, { left: 20, top: 40 }, 90, 0)
    expect(moved).toEqual(wordPlacement({ left: 32, top: 600 }, box, 90, 0))
  })

  it('takes the slide out, so text measured as it leaves is drawn where it rests', () => {
    for (const gone of [0.25, 0.5, 1]) {
      const sliding = { left: 32, top: 600 + gone * HERO_SLIDE_PX }
      expect(wordPlacement(sliding, box, 90, gone)).toEqual({ x: 32, y: 690 })
    }
  })
})
