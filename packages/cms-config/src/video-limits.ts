import type { Mp4Info } from './mp4'

export const VIDEO_USES = ['previewLoop', 'showreel', 'main'] as const
/** What a Video is for. Fields that reference a Video accept only the matching use. */
export type VideoUse = (typeof VIDEO_USES)[number]

export const VIDEO_USE_LABELS: Record<VideoUse, string> = {
  previewLoop: 'Önizleme döngüsü',
  showreel: 'Showreel döngüsü',
  main: 'Ana video',
}

type VideoLimits = {
  maxSeconds: number
  /** Width by height of the largest allowed frame; a portrait video is checked turned upright. */
  maxFrame: { width: number; height: number; label: string }
  audio: boolean
  maxBytes: number
}

const MB = 1024 * 1024

/** The caps per use (ADR-0008). */
export const VIDEO_LIMITS: Record<VideoUse, VideoLimits> = {
  previewLoop: {
    maxSeconds: 10,
    maxFrame: { width: 1280, height: 720, label: '720p' },
    audio: false,
    maxBytes: 4 * MB,
  },
  showreel: {
    maxSeconds: 30,
    maxFrame: { width: 1920, height: 1080, label: '1080p' },
    audio: false,
    maxBytes: 15 * MB,
  },
  main: {
    maxSeconds: 180,
    maxFrame: { width: 1920, height: 1080, label: '1080p' },
    audio: true,
    maxBytes: 60 * MB,
  },
}

export const NOT_MP4_MESSAGE = 'Dosya bir MP4 videosu değil. Lütfen H.264 MP4 olarak dışa aktarın.'

const H264_CODECS = ['avc1', 'avc3']

const megabytes = (bytes: number): string => (bytes / MB).toFixed(1).replace('.', ',')

function seconds(total: number): string {
  const whole = Math.ceil(total)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  if (minutes === 0) return `${rest} sn`
  return rest === 0 ? `${minutes} dk` : `${minutes} dk ${rest} sn`
}

/**
 * The first limit a video breaks for its use, as a Turkish message that names the limit and the
 * actual value; `undefined` when it fits.
 */
export function videoRefusal(use: VideoUse, info: Mp4Info, bytes: number): string | undefined {
  const limits = VIDEO_LIMITS[use]
  if (!H264_CODECS.includes(info.codec)) {
    return `Video H.264 olmalı; bu videonun kodeği ${info.codec}.`
  }
  if (bytes > limits.maxBytes) {
    return `Dosya boyutu en fazla ${limits.maxBytes / MB} MB olabilir; bu dosya ${megabytes(bytes)} MB.`
  }
  if (info.durationSeconds > limits.maxSeconds) {
    return `Süre en fazla ${seconds(limits.maxSeconds)} olabilir; bu videonun süresi ${seconds(info.durationSeconds)}.`
  }
  const { width, height, label } = limits.maxFrame
  const long = Math.max(info.width, info.height)
  const short = Math.min(info.width, info.height)
  if (long > width || short > height) {
    return `Çözünürlük en fazla ${label} (${width}×${height}) olabilir; bu video ${info.width}×${info.height}.`
  }
  if (!limits.audio && info.hasAudio) {
    return 'Bu kullanımda video sessiz olmalı; bu videoda ses kanalı var.'
  }
  return undefined
}
