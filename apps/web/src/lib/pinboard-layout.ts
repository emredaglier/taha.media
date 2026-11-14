/** The Pinboard menu's layout (#145): the sheets' places, sizes and strings as pure maths, ported from docs/design/menu3/pinboard.js. */

/** `L` is landscape, `P` portrait: `w` a fraction of the view width, `x` and `y` the pin as view fractions. `rest` is the tilt in degrees. */
export const SHEETS = [
  {
    id: 'page',
    kind: 'page',
    L: { w: 0.3, x: 0.5, y: 0.105 },
    P: { w: 0.36, x: 0.27, y: 0.165 },
    rest: -2.5,
  },
  {
    id: 'l0',
    kind: 'print',
    link: 0,
    L: { w: 0.25, x: 0.15, y: 0.28 },
    P: { w: 0.54, x: 0.7, y: 0.18 },
    rest: -1.5,
  },
  {
    id: 'l1',
    kind: 'print',
    link: 1,
    L: { w: 0.25, x: 0.85, y: 0.24 },
    P: { w: 0.56, x: 0.68, y: 0.4 },
    rest: 2,
  },
  {
    id: 'l2',
    kind: 'print',
    link: 2,
    L: { w: 0.27, x: 0.45, y: 0.6 },
    P: { w: 0.58, x: 0.38, y: 0.575 },
    rest: -1,
  },
  {
    id: 'nA',
    kind: 'note',
    L: { w: 0.1, x: 0.07, y: 0.7 },
    P: { w: 0.2, x: 0.14, y: 0.735 },
    rest: -4,
  },
  {
    id: 'nB',
    kind: 'note',
    L: { w: 0.09, x: 0.78, y: 0.58 },
    P: { w: 0.2, x: 0.88, y: 0.6 },
    rest: 3,
  },
  {
    id: 'st',
    kind: 'story',
    L: { w: 0.26, x: 0.21, y: 0.85 },
    P: { w: 0.5, x: 0.3, y: 0.9 },
    rest: 1,
  },
  {
    id: 'gz',
    kind: 'legal',
    L: { w: 0.13, x: 0.86, y: 0.76 },
    P: { w: 0.3, x: 0.78, y: 0.76 },
    rest: -2,
  },
] as const

export type SheetKind = (typeof SHEETS)[number]['kind']

export type SheetLayout = {
  id: string
  kind: SheetKind
  /** The pin (top centre), and the sheet's size. */
  x: number
  y: number
  w: number
  h: number
  /** The sheet's centre. */
  cx: number
  cy: number
  /** The leave flight: the picture's centre height and size inside the sheet, the scale that makes it cover the view, and the offsets. */
  fillY: number
  fillW: number
  fillH: number
  S: number
  dx: number
  dy: number
  /** Tape strip height and word size (prints), note text size (notes and the legal note); 0 where not used. */
  tapeH: number
  tapeFont: number
  noteFont: number
}

export type Board = {
  portrait: boolean
  K: number
  PP: number
  /** The border round the page and the prints. */
  b: number
  /** The page sheet: its scale, and the pivot offsets of the prototype's `renderPage()`. */
  s1: number
  T1x: number
  T1y: number
  Ox: number
  Oy: number
  sheets: SheetLayout[]
}

/** Characters of each print's word (by link index) and of the legal note's word: the tape and note type sizes depend on them. */
export type LabelLengths = { prints: readonly number[]; legal: number }

const size = (n: number) => (Number.isFinite(n) && n > 1 ? n : 1)

export function layoutBoard(width: number, height: number, labels: LabelLengths): Board {
  const vw = size(width)
  const vh = size(height)
  const portrait = vh > vw * 1.15
  const K = portrait ? Math.min(vw / 390, vh / 844) : Math.min(vw / 1440, vh / 900)
  const b = Math.round(12 * K)
  let s1 = 0.3
  let pageX = 0
  let pageY = 0

  const sheets = SHEETS.map((d): SheetLayout => {
    const p = portrait ? d.P : d.L
    const w = p.w * vw
    const x = p.x * vw
    const y = p.y * vh
    let h: number
    let fillY = 0
    let fillW = 0
    let fillH = 0
    let tapeH = 0
    let tapeFont = 0
    let noteFont = 0
    if (d.kind === 'page') {
      const inW = w - 2 * b
      h = (inW * vh) / vw + 2 * b
      s1 = inW / vw
      pageX = x
      pageY = y
    } else if (d.kind === 'print') {
      const iw = w - 2 * b
      h = (iw * 9) / 16 + 2 * b
      fillY = b + (iw * 9) / 32
      fillW = iw
      fillH = (iw * 9) / 16
      tapeH = w * 0.26
      const chars = Math.max(1, labels.prints[d.link] ?? 1)
      tapeFont = Math.min(tapeH * 0.78, (w * 0.84) / (chars * 0.47))
    } else if (d.kind === 'story') {
      h = w * 0.2
    } else {
      h = w * 0.92
    }
    if (d.kind === 'note' || d.kind === 'legal') {
      noteFont = Math.min(w * 0.2, (w * 0.8) / (Math.max(1, labels.legal) * 0.42))
      fillY = h / 2
      fillW = w
      fillH = h
    }
    const S = Math.max(vw / (fillW || 1), vh / (fillH || 1)) * 1.04
    return {
      id: d.id,
      kind: d.kind,
      x,
      y,
      w,
      h,
      cx: x,
      cy: y + h / 2,
      fillY,
      fillW,
      fillH,
      S,
      dx: vw / 2 - x,
      dy: vh / 2 - S * fillY - y,
      tapeH,
      tapeFont,
      noteFont,
    }
  })

  return {
    portrait,
    K,
    PP: 1100 * K,
    b,
    s1,
    T1x: pageX - vw / 2,
    T1y: pageY + b / s1,
    Ox: vw / 2 - pageX,
    Oy: -b / s1 - pageY,
    sheets,
  }
}

type Point = { x: number; y: number }

/**
 * The string from the page's pin to a print's pin as an SVG path: it sags (less when taut, more when the print is lifted), swings with
 * both sheets' angles (degrees), and `bows` round the sheet for the bottom print.
 */
export function stringCurve(
  from: Point,
  to: Point,
  {
    bows,
    angle,
    pageAngle,
    lift,
    taut,
  }: { bows: boolean; angle: number; pageAngle: number; lift: number; taut: number },
) {
  const [x0, y0, x1, y1] = [from.x, from.y + 9, to.x, to.y + 9]
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const dist = Math.hypot(x1 - x0, y1 - y0)
  const bow = bows ? -dist * 0.3 : 0
  const sag = dist * 0.11 * (1 - taut) + Math.abs(lift) * 8
  return `M${x0} ${y0}Q${mx + bow + (angle + pageAngle) * 2.2} ${my + sag} ${x1} ${y1}`
}
