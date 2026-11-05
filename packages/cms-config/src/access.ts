import type { Access, PayloadRequest } from 'payload'

/**
 * Any signed-in Editor. Every Editor has the same rights (GLOSSARY: Editor), so there are no
 * roles: being signed in is the only check.
 */
export const editor = ({ req }: { req: PayloadRequest }): boolean => Boolean(req.user)

/** Published documents for everyone; drafts as well for a signed-in Editor. */
export const publishedOrEditor: Access = ({ req }) =>
  req.user ? true : { _status: { equals: 'published' } }
