import type { Payload } from 'payload'

import { assertPassword, findEditor, neverSaved, normalizeEmail, type Account } from './accounts'
import { lexical } from './lexical'

const PRIVACY_PLACEHOLDER = lexical([
  { heading: 'Gizlilik Politikası' },
  'Bu metin geçici bir taslaktır. Yayınlanmadan önce Taha tarafından yazılıp gözden geçirilecektir.',
  { heading: 'Toplanan veriler' },
  'Bu sitede ziyaretçilerden kişisel veri toplanmaz. Ayrıntılar bu metin tamamlandığında burada yer alacaktır.',
])

export type ProductionSeedOptions = {
  /** The developer and Taha, in any order. Emails and passwords come from the environment. */
  accounts: Account[]
  log?: (message: string) => void
}

const SINGLE_ENTRY_PAGES = ['site', 'about', 'privacy'] as const

/**
 * The production seed (ADR-0013): exactly two Editors, Site and About as empty published pages,
 * and a Privacy text as an unpublished draft. Safe to run again: existing Editors keep their
 * password and existing pages are left alone. Everything goes through the Local API, so the
 * normal validation applies.
 */
export async function seedProduction(
  payload: Payload,
  { accounts, log = () => undefined }: ProductionSeedOptions,
): Promise<void> {
  if (accounts.length !== 2) {
    throw new Error('The production seed needs exactly two Editor accounts (developer and Taha).')
  }
  const emails = accounts.map((account) => normalizeEmail(account.email))
  if (new Set(emails).size !== 2) throw new Error('The two Editor emails must differ.')
  for (const account of accounts) assertPassword(account.password)

  for (const [index, account] of accounts.entries()) {
    const email = emails[index]!
    if (await findEditor(payload, email)) {
      log(`editor ${email}: exists`)
      continue
    }
    await payload.create({ collection: 'users', data: { email, password: account.password } })
    log(`editor ${email}: created`)
  }

  for (const slug of SINGLE_ENTRY_PAGES) {
    if (!(await neverSaved(payload, slug))) {
      log(`${slug}: exists`)
      continue
    }
    if (slug === 'privacy') {
      await payload.updateGlobal({
        slug,
        draft: true,
        data: { body: PRIVACY_PLACEHOLDER, _status: 'draft' },
      })
    } else {
      await payload.updateGlobal({ slug, data: { _status: 'published' } })
    }
    log(`${slug}: created`)
  }
}
