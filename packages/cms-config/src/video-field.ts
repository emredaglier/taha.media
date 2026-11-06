import { ValidationError, type UploadField } from 'payload'

import { VIDEO_USE_LABELS, type VideoUse } from './video-limits'

/**
 * A relationship to a Video that accepts only Videos of one use. The admin picker lists just
 * those, and a field hook refuses any other, drafts included (Payload skips field validation on
 * draft saves, field hooks still run). Use it for every field that references a Video.
 */
export function videoField({
  name,
  label,
  use,
  required = false,
}: {
  name: string
  label: string
  use: VideoUse
  required?: boolean
}): UploadField {
  const refusal = `${label} yalnızca “${VIDEO_USE_LABELS[use]}” kullanımlı bir video olabilir.`
  return {
    name,
    label,
    type: 'upload',
    relationTo: 'videos',
    required,
    filterOptions: { use: { equals: use } },
    hooks: {
      beforeValidate: [
        async ({ collection, req, value }) => {
          const id =
            typeof value === 'object' && value !== null ? (value as { id: unknown }).id : value
          if (id === undefined || id === null || id === '') return value
          const video = await req.payload.findByID({
            collection: 'videos',
            id: id as number,
            depth: 0,
            req,
            overrideAccess: true,
            select: { use: true },
          })
          if (video.use === use) return value
          throw new ValidationError(
            {
              collection: collection?.slug,
              errors: [{ path: name, label, message: refusal }],
              req,
            },
            req.t,
          )
        },
      ],
    },
  }
}
