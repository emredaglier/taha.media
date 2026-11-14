import { describe, expect, it } from 'vitest'

import { layoutStatement, wrapLines } from './room-statement'

// Every character is half a size wide.
const measure = (text: string, size: number) => text.length * size * 0.5
const box = { width: 1000, height: 400, fontMax: 100, fontMin: 20, lineHeight: 1 }
const tenPerChar = (line: string) => line.length * 10

describe('wrapLines: breaks on spaces, to the width', () => {
  it('keeps what fits on one line', () => {
    expect(wrapLines('bir iki', 1000, tenPerChar)).toEqual(['bir iki'])
  })

  it('breaks before the word that would not fit, and loses no word', () => {
    expect(wrapLines('aa bb cc dd', 55, tenPerChar)).toEqual(['aa bb', 'cc dd'])
  })

  it('lets a word wider than the line stand alone', () => {
    expect(wrapLines('a verylongword b', 50, tenPerChar)).toEqual(['a', 'verylongword', 'b'])
  })

  it('has no lines for no text', () => {
    expect(wrapLines('  \n ', 100, tenPerChar)).toEqual([])
  })
})

describe('layoutStatement: the largest type that fits the sheet', () => {
  it('sets a short Statement at the largest size', () => {
    const { size, lines } = layoutStatement('Kurgu', box, measure)
    expect(size).toBe(box.fontMax)
    expect(lines).toEqual(['Kurgu'])
  })

  it('shrinks a long Statement until its lines fit the height, and every line fits the width', () => {
    const text = Array.from({ length: 30 }, () => 'kelime').join(' ')
    const { size, lines } = layoutStatement(text, box, measure)
    expect(size).toBeLessThan(box.fontMax)
    expect(lines.length * size * box.lineHeight).toBeLessThanOrEqual(box.height)
    for (const line of lines) expect(measure(line, size)).toBeLessThanOrEqual(box.width)
    expect(lines.join(' ')).toBe(text)
  })

  it('stops at the smallest size when nothing fits', () => {
    const text = Array.from({ length: 2000 }, () => 'kelime').join(' ')
    expect(layoutStatement(text, box, measure).size).toBe(box.fontMin)
  })
})
