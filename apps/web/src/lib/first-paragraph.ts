import { richTextToPlainText } from '@taha/cms-config'

type Node = { type?: string; children?: unknown[] }

/**
 * An editor state holding only the first paragraph that has text (the short About on Home), or
 * null when there is none. Anything that is not an editor state gives null.
 */
export function firstParagraph(data: unknown): { root: { type: 'root'; children: Node[] } } | null {
  const children = (data as { root?: { children?: Node[] } } | null | undefined)?.root?.children
  const found = children?.find(
    (node) => node.type === 'paragraph' && richTextToPlainText({ root: node }) !== '',
  )
  return found ? { root: { type: 'root', children: [found] } } : null
}
