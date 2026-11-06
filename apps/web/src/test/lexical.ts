/** Builders for Lexical editor states, as Payload stores rich text, for tests that publish it. */

export const textNode = (value: string, format = 0) => ({
  type: 'text',
  text: value,
  format,
  version: 1,
  detail: 0,
  mode: 'normal',
  style: '',
})

export const block = (type: string, children: object[], extra: object = {}) => ({
  type,
  children,
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  version: 1,
  ...extra,
})

export const doc = (...children: object[]) => ({
  root: {
    type: 'root',
    children,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1,
  },
})

export const paragraphs = (...texts: string[]) =>
  doc(...texts.map((value) => block('paragraph', [textNode(value)])))

/** Text format bits Lexical stores: bold is 1, italic is 2. */
export const BOLD = 1
export const ITALIC = 2

export const linkNode = (url: string, label: string, newTab = false) =>
  block('link', [textNode(label)], { fields: { linkType: 'custom', url, newTab } })
