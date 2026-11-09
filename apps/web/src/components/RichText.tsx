import { Fragment, type ReactNode } from 'react'

/** The Lexical nodes the CMS lets an Editor write (restricted rich text); anything else is ignored. */
type RichNode = {
  type?: string
  text?: string
  /** Lexical's text format bits: bold is 1, italic is 2. */
  format?: number
  /** `h2` or `h3` on a heading. */
  tag?: string
  /** `bullet` or `number` on a list. */
  listType?: string
  fields?: { url?: string; newTab?: boolean }
  children?: RichNode[]
}

const BOLD = 1
const ITALIC = 2

/** Only web, mail, phone, same-site and in-page links render as links; the rest keep their text. */
function safeHref(url: string | undefined): string | null {
  const href = url?.trim()
  return href && /^(https?:|mailto:|tel:|#|\/(?!\/))/i.test(href) ? href : null
}

function renderNodes(nodes: RichNode[] | undefined): ReactNode[] {
  return (nodes ?? []).map((node, index) => renderNode(node, index))
}

function renderNode(node: RichNode, key: number): ReactNode {
  const children = renderNodes(node.children)
  switch (node.type) {
    case 'text': {
      let out: ReactNode = node.text
      if ((node.format ?? 0) & BOLD) out = <strong>{out}</strong>
      if ((node.format ?? 0) & ITALIC) out = <em>{out}</em>
      return <Fragment key={key}>{out}</Fragment>
    }
    case 'linebreak':
      return <br key={key} />
    case 'paragraph':
      return (
        <p key={key} className="mb-4 leading-relaxed">
          {children}
        </p>
      )
    case 'heading':
      return node.tag === 'h3' ? (
        <h3 key={key} className="mt-8 mb-3 font-serif text-xl">
          {children}
        </h3>
      ) : (
        <h2 key={key} className="mt-10 mb-4 font-serif text-2xl">
          {children}
        </h2>
      )
    case 'list': {
      const List = node.listType === 'number' ? 'ol' : 'ul'
      return (
        <List
          key={key}
          className={`mb-4 pl-6 ${node.listType === 'number' ? 'list-decimal' : 'list-disc'}`}
        >
          {children}
        </List>
      )
    }
    case 'listitem':
      return <li key={key}>{children}</li>
    case 'link': {
      const href = safeHref(node.fields?.url)
      if (!href) return <Fragment key={key}>{children}</Fragment>
      const external = /^https?:/i.test(href)
      return (
        <a
          key={key}
          href={href}
          className="underline"
          {...(node.fields?.newTab && external
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : {})}
        >
          {children}
        </a>
      )
    }
    default:
      // An unknown node (a feature the Editor can't use today) keeps its content, loses its markup.
      return <Fragment key={key}>{children}</Fragment>
  }
}

/**
 * CMS rich text as semantic HTML: paragraphs, bold, italic, links, H2/H3 and lists. Shared by
 * every page that shows Editor text. `data` is the editor state a read returns; anything else
 * renders nothing.
 */
export function RichText({ data }: { data: unknown }) {
  const root = (data as { root?: RichNode } | null | undefined)?.root
  return <>{renderNodes(root?.children)}</>
}
