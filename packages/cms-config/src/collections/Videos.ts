import fs from 'node:fs/promises'

import {
  ValidationError,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type PayloadRequest,
} from 'payload'

import { editor } from '../access'
import { anyReferences } from '../media-references'
import { readMp4, type Mp4Info } from '../mp4'
import {
  NOT_MP4_MESSAGE,
  VIDEO_USE_LABELS,
  VIDEO_USES,
  videoRefusal,
  type VideoUse,
} from '../video-limits'
import { uniqueFilename } from './Images'

const refuse = (collection: string, req: PayloadRequest, message: string): never => {
  throw new ValidationError(
    { collection, errors: [{ path: 'filename', label: 'Dosya', message }], req },
    req.t,
  )
}

/** The bytes of the file being uploaded (in memory, or in the temp file Payload spooled it to). */
async function uploadedBytes(file: NonNullable<PayloadRequest['file']>): Promise<Buffer> {
  if (file.data?.length) return file.data
  return file.tempFilePath ? fs.readFile(file.tempFilePath) : Buffer.alloc(0)
}

/**
 * Reads the MP4 header of a new file, or takes the stored values when only the use changes, then
 * checks the caps for the use. The readings are written into the document, overriding anything
 * the request sent.
 */
const readAndCheck: CollectionBeforeValidateHook = async ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  const use = (data?.use ?? originalDoc?.use) as VideoUse | undefined
  if (!data || !use) return data

  let info: Mp4Info
  let bytes: number
  if (req.file) {
    const buffer = await uploadedBytes(req.file)
    bytes = buffer.length
    const read = readMp4(buffer)
    if (!read) return refuse(collection.slug, req, NOT_MP4_MESSAGE)
    info = read
  } else if (originalDoc?.codec) {
    bytes = originalDoc.filesize ?? 0
    info = {
      width: originalDoc.width,
      height: originalDoc.height,
      durationSeconds: originalDoc.duration,
      codec: originalDoc.codec,
      hasAudio: Boolean(originalDoc.hasAudio),
    }
  } else {
    return data
  }

  const message = videoRefusal(use, info, bytes)
  if (message) return refuse(collection.slug, req, message)

  data.width = info.width
  data.height = info.height
  data.duration = info.durationSeconds
  data.codec = info.codec
  data.hasAudio = info.hasAudio
  return data
}

export const lockedUseMessage = (places: string[]): string =>
  `Bu video kullanıldığı için kullanımı değiştirilemez: ${places.join(', ')}. Önce videoyu oradan kaldırın.`

/**
 * Each field that references a Video accepts one use (`videoField`), so a Video's use must not
 * change while a Work or page references it, in a draft or published: the field would then hold a
 * wrongly-used Video without anyone seeing a refusal.
 */
const keepUseWhileReferenced: CollectionBeforeValidateHook = async ({
  collection,
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || !data?.use || !originalDoc || data.use === originalDoc.use) {
    return data
  }
  const places = await anyReferences(req, [{ target: 'videos', ids: [originalDoc.id] }])
  if (places.length === 0) return data
  throw new ValidationError(
    {
      collection: collection.slug,
      errors: [{ path: 'use', label: 'Kullanım', message: lockedUseMessage(places) }],
      req,
    },
    req.t,
  )
}

/**
 * A Video (GLOSSARY): an MP4 (H.264) the Editor exported, with its use, a required poster Image
 * and the facts read from its header (ADR-0008).
 */
export const Videos: CollectionConfig = {
  slug: 'videos',
  labels: { singular: 'Video', plural: 'Videolar' },
  access: {
    // Media URLs are public anyway; the Local API read is open so any Work can embed its video.
    read: () => true,
    create: editor,
    update: editor,
    delete: editor,
  },
  admin: { useAsTitle: 'filename', defaultColumns: ['filename', 'use', 'duration', 'createdAt'] },
  hooks: {
    beforeOperation: [
      ({ args, operation, req }) => {
        if ((operation === 'create' || operation === 'update') && req.file) {
          req.file.name = uniqueFilename(req.file.name, undefined, 'video')
        }
        return args
      },
    ],
    beforeValidate: [keepUseWhileReferenced, readAndCheck],
  },
  fields: [
    {
      name: 'use',
      label: 'Kullanım',
      type: 'select',
      required: true,
      options: VIDEO_USES.map((value) => ({ value, label: VIDEO_USE_LABELS[value] })),
      admin: {
        description:
          'Önizleme döngüsü: en fazla 10 sn, 720p, sessiz, 4 MB. Showreel döngüsü: en fazla 30 sn, 1080p, sessiz, 15 MB. Ana video: en fazla 3 dk, 1080p, sesli olabilir, 60 MB.',
      },
    },
    {
      name: 'poster',
      label: 'Poster görseli',
      type: 'upload',
      relationTo: 'images',
      required: true,
    },
    // Width and height are Payload's own (hidden, read-only) upload fields; the hook fills them.
    {
      name: 'duration',
      label: 'Süre (sn)',
      type: 'number',
      admin: { readOnly: true, description: 'Dosyadan otomatik okunur.' },
    },
    { name: 'codec', label: 'Kodek', type: 'text', admin: { readOnly: true } },
    { name: 'hasAudio', label: 'Ses var', type: 'checkbox', admin: { readOnly: true } },
  ],
  // No `mimeTypes`: the file is judged by its header, so a wrong type gets the Turkish refusal.
  upload: { focalPoint: false },
}
