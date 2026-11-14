/**
 * The Statement on the Edit Room's sheet (#128), pure like the room model: how its words are laid
 * out. Drawing them onto the canvas is the scene's job; `measure` is the canvas's `measureText`.
 */

/** `text` broken on spaces into lines no wider than `maxWidth`; a word wider than the line stands alone. */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word
    if (line && measure(longer) > maxWidth) {
      lines.push(line)
      line = word
    } else line = longer
  }
  if (line) lines.push(line)
  return lines
}

/**
 * The largest type size (stepping down from `fontMax` to `fontMin`, in 4s) at which `text` set in
 * `width` fits `height`, with its lines. At `fontMin` it is as it is. `measure(line, size)` is the line's width.
 */
export function layoutStatement(
  text: string,
  box: { width: number; height: number; fontMax: number; fontMin: number; lineHeight: number },
  measure: (line: string, size: number) => number,
): { size: number; lines: string[] } {
  let size = box.fontMax
  for (;;) {
    const lines = wrapLines(text, box.width, (line) => measure(line, size))
    if (size <= box.fontMin || lines.length * size * box.lineHeight <= box.height)
      return { size: Math.max(size, box.fontMin), lines }
    size -= 4
  }
}
