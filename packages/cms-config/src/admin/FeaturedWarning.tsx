import type { UIFieldServerComponent } from 'payload'

import { featuredCountWarning } from '../featured'

/**
 * Shown under the featured fields of a Work: counts the published Featured Works and warns when
 * the count is not the 8 the Edit Room shows. Display only, it never blocks a save.
 */
export const FeaturedWarning: UIFieldServerComponent = async ({ payload }) => {
  const { totalDocs } = await payload.count({
    collection: 'works',
    where: { featured: { equals: true }, _status: { equals: 'published' } },
  })
  const warning = featuredCountWarning(totalDocs)
  if (!warning) return null
  return (
    <div role="status" style={{ color: 'var(--theme-warning-600, #b45309)', marginBottom: 16 }}>
      {warning}
    </div>
  )
}
