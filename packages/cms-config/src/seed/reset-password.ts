import type { Payload } from 'payload'

import { assertPassword, findEditor, normalizeEmail } from './accounts'

/**
 * Sets a new password for an existing Editor and clears any login lock (ADR-0013: this replaces
 * "forgot password"). It never creates an account: an unknown email is an error.
 */
export async function resetPassword(
  payload: Payload,
  email: string,
  password: string,
): Promise<void> {
  assertPassword(password)
  const user = await findEditor(payload, email)
  if (!user) {
    throw new Error(`No Editor with the email ${normalizeEmail(email)}. Nothing was changed.`)
  }
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { password, loginAttempts: 0, lockUntil: null },
    depth: 0,
  })
}
