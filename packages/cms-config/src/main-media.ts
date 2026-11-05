import { ValidationError, type CollectionBeforeValidateHook, type GroupField } from 'payload'

import { EXTERNAL_PROVIDERS, EXTERNAL_URL_REFUSAL, parseExternalVideoUrl } from './external-video'
import { videoField } from './video-field'

export const MAIN_MEDIA_KINDS = ['video', 'external', 'image'] as const
export type MainMediaKind = (typeof MAIN_MEDIA_KINDS)[number]

const KIND_LABELS: Record<MainMediaKind, string> = {
  video: 'Video (yükle)',
  external: 'Dış bağlantı (Vimeo veya YouTube)',
  image: 'Görsel',
}

export const NO_MAIN_MEDIA_MESSAGE = 'Ana medya türünü seçin: video, dış bağlantı veya görsel.'
export const NO_MAIN_VIDEO_MESSAGE = 'Ana videoyu seçin.'
export const NO_MAIN_IMAGE_MESSAGE = 'Ana görseli seçin.'
export const NO_EXTERNAL_URL_MESSAGE = 'Vimeo veya YouTube video adresini yapıştırın.'
export const NO_EXTERNAL_POSTER_MESSAGE = 'Dış bağlantı için bir kapak görseli seçin.'

/** The Work's main media (GLOSSARY): exactly one, chosen by kind. Rules live in `mainMediaHook`. */
export function mainMediaField(): GroupField {
  const when = (kind: MainMediaKind) => ({
    condition: (_: unknown, siblingData: { kind?: unknown }) => siblingData?.kind === kind,
  })
  return {
    name: 'mainMedia',
    label: 'Ana medya',
    type: 'group',
    fields: [
      {
        name: 'kind',
        label: 'Tür',
        type: 'select',
        options: MAIN_MEDIA_KINDS.map((value) => ({ value, label: KIND_LABELS[value] })),
      },
      {
        ...videoField({ name: 'video', label: 'Ana video', use: 'main' }),
        admin: when('video'),
      },
      {
        name: 'externalUrl',
        label: 'Video adresi',
        type: 'text',
        admin: { ...when('external'), description: 'Vimeo veya YouTube adresini yapıştırın.' },
      },
      {
        name: 'externalProvider',
        label: 'Sağlayıcı',
        type: 'select',
        options: EXTERNAL_PROVIDERS.map((value) => ({ value, label: value })),
        admin: { ...when('external'), readOnly: true, description: 'Adresten otomatik okunur.' },
      },
      {
        name: 'externalId',
        label: 'Video kimliği',
        type: 'text',
        admin: { ...when('external'), readOnly: true, description: 'Adresten otomatik okunur.' },
      },
      {
        name: 'externalPoster',
        label: 'Kapak görseli (oynatıcıdan önce)',
        type: 'upload',
        relationTo: 'images',
        admin: when('external'),
      },
      {
        name: 'image',
        label: 'Ana görsel',
        type: 'upload',
        relationTo: 'images',
        admin: when('image'),
      },
    ],
  }
}

/** The upload fields of each kind, and the fields only that kind uses. */
const KIND_FIELDS: Record<MainMediaKind, string[]> = {
  video: ['video'],
  external: ['externalUrl', 'externalProvider', 'externalId', 'externalPoster'],
  image: ['image'],
}
const ALL_FIELDS = Object.values(KIND_FIELDS).flat()

const idOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? (value as { id: unknown }).id : value

const present = (value: unknown): boolean => value !== undefined && value !== null && value !== ''

type Row = Record<string, unknown>

/**
 * Normalises the main media on every save and requires it on publish:
 * - the fields of the other kinds are cleared, so switching kind leaves nothing stale;
 * - an external URL is parsed into provider and id, and an unrecognised one is refused, drafts
 *   included (so the stored provider and id never disagree with the URL);
 * - on publish the chosen kind must be complete. Payload skips `required` on drafts and cannot
 *   express "required for this kind only", so this hook does both.
 */
export const mainMediaHook: CollectionBeforeValidateHook = ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data
  const before = (originalDoc?.mainMedia ?? {}) as Row
  const incoming = (data.mainMedia ?? {}) as Row
  const merged: Row = { ...before, ...incoming }
  const kind = merged.kind as MainMediaKind | null | undefined

  const next: Row = { kind: kind ?? null }
  for (const field of ALL_FIELDS) {
    next[field] = kind && KIND_FIELDS[kind].includes(field) ? (idOf(merged[field]) ?? null) : null
  }

  const errors: { path: string; label: string; message: string }[] = []
  const fail = (path: string, label: string, message: string) =>
    errors.push({ path: `mainMedia.${path}`, label, message })

  if (kind === 'external') {
    const url = typeof next.externalUrl === 'string' ? next.externalUrl.trim() : ''
    const parsed = url === '' ? null : parseExternalVideoUrl(url)
    next.externalUrl = url === '' ? null : url
    next.externalProvider = parsed?.provider ?? null
    next.externalId = parsed?.id ?? null
    if (url !== '' && !parsed) fail('externalUrl', 'Video adresi', EXTERNAL_URL_REFUSAL)
  }

  const status = data._status ?? originalDoc?._status
  if (status === 'published' && errors.length === 0) {
    if (!kind) fail('kind', 'Tür', NO_MAIN_MEDIA_MESSAGE)
    else if (kind === 'video' && !present(next.video))
      fail('video', 'Ana video', NO_MAIN_VIDEO_MESSAGE)
    else if (kind === 'image' && !present(next.image))
      fail('image', 'Ana görsel', NO_MAIN_IMAGE_MESSAGE)
    else if (kind === 'external') {
      if (!present(next.externalUrl)) fail('externalUrl', 'Video adresi', NO_EXTERNAL_URL_MESSAGE)
      if (!present(next.externalPoster))
        fail('externalPoster', 'Kapak görseli', NO_EXTERNAL_POSTER_MESSAGE)
    }
  }

  if (errors.length > 0) {
    throw new ValidationError({ collection: collection.slug, errors, req }, req.t)
  }
  data.mainMedia = next
  return data
}
