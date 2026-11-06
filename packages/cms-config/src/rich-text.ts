import {
  BoldFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
  ParagraphFeature,
  type FeatureProviderServer,
} from '@payloadcms/richtext-lexical'

/**
 * The restricted rich text every Editor-facing description uses: paragraphs, bold, italic and
 * links, nothing else, so the text always fits the design (spec #1 story 11).
 *
 * Variants build on it: pass the extra features (headings, lists) as `extra`. Features outside the
 * list are not offered in the toolbar or the slash menu, so an Editor cannot add them.
 */
// Payload types each feature by its own props; the list mixes them, so the element type is open.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RichTextFeature = FeatureProviderServer<any, any, any>

export const BASE_RICH_TEXT_FEATURES = (): RichTextFeature[] => [
  ParagraphFeature(),
  BoldFeature(),
  ItalicFeature(),
  LinkFeature(),
  InlineToolbarFeature(),
]

export function restrictedRichText(extra: RichTextFeature[] = []) {
  return lexicalEditor({ features: [...BASE_RICH_TEXT_FEATURES(), ...extra] })
}

type LexicalNode = { type?: string; text?: string; children?: LexicalNode[] }

/**
 * The text of a rich-text value, blocks separated by one space and whitespace collapsed. Used for
 * the SEO description fallback. Anything that is not an editor state gives an empty string.
 */
export function richTextToPlainText(value: unknown): string {
  const parts: string[] = []
  const walk = (node: LexicalNode): void => {
    if (typeof node.text === 'string') parts.push(node.text)
    if (node.children) {
      for (const child of node.children) walk(child)
      // A block (paragraph, heading, list item) ends with a break; inline nodes (link) do not.
      if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listitem') {
        parts.push(' ')
      }
    }
  }
  const root = (value as { root?: LexicalNode } | null | undefined)?.root
  if (root) walk(root)
  return parts.join('').replace(/\s+/g, ' ').trim()
}
