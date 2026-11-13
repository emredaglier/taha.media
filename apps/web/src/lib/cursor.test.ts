// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { cursorLabel } from './cursor'

const ORIGIN = location.origin

/** The element inside `html`, as the mouse would hit it. */
const hit = (html: string): Element => {
  document.body.innerHTML = html
  return document.getElementById('hit')!
}

describe('cursorLabel', () => {
  it('has no label for a plain element or no element', () => {
    expect(cursorLabel(hit('<p id="hit">text</p>'), ORIGIN)).toBe('')
    expect(cursorLabel(null, ORIGIN)).toBe('')
  })

  it('takes the nearest data-cursor, from a child of it too', () => {
    expect(cursorLabel(hit('<a href="/x" data-cursor="İzle"><i id="hit"></i></a>'), ORIGIN)).toBe(
      'İzle',
    )
    expect(
      cursorLabel(hit('<div data-cursor="Dış"><b data-cursor="İç" id="hit"></b></div>'), ORIGIN),
    ).toBe('İç')
  })

  it('lets an empty data-cursor switch the label off, even on a link', () => {
    expect(cursorLabel(hit('<a href="/x" data-cursor=""><i id="hit"></i></a>'), ORIGIN)).toBe('')
  })

  it('names a link by where it leads', () => {
    const label = (href: string) => cursorLabel(hit(`<a href="${href}" id="hit">x</a>`), ORIGIN)
    expect(label('/')).toBe('Ana sayfa')
    expect(label('mailto:a@b.co')).toBe('Yaz')
    expect(label('https://youtube.com/watch')).toBe('Git')
    expect(label('/isler')).toBe('Aç')
    expect(label(`${ORIGIN}/isler`)).toBe('Aç')
  })

  it('has no label for an anchor without href', () => {
    expect(cursorLabel(hit('<a id="hit">x</a>'), ORIGIN)).toBe('')
  })
})
