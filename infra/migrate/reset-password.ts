// Resets a forgotten Editor password on the server (ADR-0013). Runbook: infra/README.md, Deploy,
// "A forgotten admin password".
// Same as `pnpm user:reset-password` (apps/cms/scripts/reset-password.ts) but against this image's
// config. The new password is NEW_PASSWORD when set, otherwise a random one that is printed once.
import { randomBytes } from 'node:crypto'

import { getPayload } from 'payload'

import config from './payload.config.ts'
import { resetPassword } from './src/seed/reset-password.ts'

const email = process.argv[2]
if (!email || email.startsWith('-')) {
  console.error('Usage: reset-password.ts -- <email>   (optional: NEW_PASSWORD=...)')
  process.exit(1)
}
const password = process.env.NEW_PASSWORD?.trim() || randomBytes(15).toString('base64url')

const payload = await getPayload({ config })
let code = 0
try {
  await resetPassword(payload, email, password)
  console.log(`Password changed for ${email}.`)
  if (!process.env.NEW_PASSWORD?.trim()) console.log(`New password: ${password}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  code = 1
} finally {
  await payload.destroy()
}
process.exit(code)
