import type { CollectionConfig } from 'payload'

import { editor } from '../access'

/**
 * Editors (GLOSSARY): everyone who signs in to the admin, all with the same rights, so there is no
 * role field. There is no public sign-up: `create` needs a signed-in Editor. The first Editor is
 * made through Payload's first-register screen, which only works while the table is empty.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Editör', plural: 'Editörler' },
  access: {
    admin: editor,
    create: editor,
    delete: editor,
    read: editor,
    update: editor,
    // Payload's default lets any signed-in user unlock any account. Locks expire on their own.
    unlock: () => false,
  },
  admin: {
    defaultColumns: ['email', 'updatedAt'],
    useAsTitle: 'email',
  },
  endpoints: [
    {
      // cms sends no email (ADR-0013), so a reset link can never be delivered. Refused before
      // Payload's own handler, so it creates no token either.
      path: '/forgot-password',
      method: 'post',
      handler: () => Response.json({ errors: [{ message: 'Not found.' }] }, { status: 404 }),
    },
  ],
  auth: {
    lockTime: 10 * 60 * 1000,
    maxLoginAttempts: 5,
    tokenExpiration: 2 * 60 * 60,
    cookies: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
    },
  },
  fields: [],
  timestamps: true,
}
