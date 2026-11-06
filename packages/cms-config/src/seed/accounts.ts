import type { Payload } from 'payload'

export const MIN_PASSWORD_LENGTH = 12

export type Account = { email: string; password: string }

type Env = Record<string, string | undefined>

/**
 * The two production Editors from the environment (never committed):
 * `SEED_DEVELOPER_EMAIL`/`_PASSWORD` and `SEED_TAHA_EMAIL`/`_PASSWORD`.
 */
export function accountsFromEnv(env: Env = process.env): Account[] {
  const names = [
    'SEED_DEVELOPER_EMAIL',
    'SEED_DEVELOPER_PASSWORD',
    'SEED_TAHA_EMAIL',
    'SEED_TAHA_PASSWORD',
  ]
  const missing = names.filter((name) => !(env[name] ?? '').trim())
  if (missing.length > 0) throw new Error(`Set ${missing.join(', ')} (see .env.example).`)
  return [
    { email: env.SEED_DEVELOPER_EMAIL!, password: env.SEED_DEVELOPER_PASSWORD! },
    { email: env.SEED_TAHA_EMAIL!, password: env.SEED_TAHA_PASSWORD! },
  ]
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

/** Throws a readable message for a password the seeds and the reset command refuse. */
export function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`)
  }
}

/**
 * Whether a single-entry page has ever been saved, as a draft or published. Counted from its
 * versions: a draft-only page has no `createdAt` on the document itself.
 */
export async function neverSaved(payload: Payload, slug: 'site' | 'about' | 'privacy') {
  return (await payload.countGlobalVersions({ global: slug })).totalDocs === 0
}

/** The Editor with this email, or `undefined`. */
export async function findEditor(payload: Payload, email: string) {
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: normalizeEmail(email) } },
    limit: 1,
    depth: 0,
    pagination: false,
  })
  return docs[0]
}
