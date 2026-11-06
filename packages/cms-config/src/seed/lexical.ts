const text = (value: string) => ({
  type: 'text',
  text: value,
  format: 0,
  detail: 0,
  mode: 'normal',
  style: '',
  version: 1,
})

const block = (type: string, extra: Record<string, unknown>, value: string) => ({
  type,
  ...extra,
  children: [text(value)],
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
})

export type Block = { heading: string } | string

/** A Lexical editor state from plain paragraphs (a string) and H2 headings (`{ heading }`). */
export function lexical(blocks: Block[]) {
  return {
    root: {
      type: 'root',
      children: blocks.map((entry) =>
        typeof entry === 'string'
          ? block('paragraph', { textFormat: 0, textStyle: '' }, entry)
          : block('heading', { tag: 'h2' }, entry.heading),
      ),
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
    },
  }
}
