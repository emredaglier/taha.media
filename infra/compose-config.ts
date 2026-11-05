import fs from 'node:fs'
import path from 'node:path'

import { parse, YAMLMap, YAMLSeq, type ScalarTag, type CollectionTag } from 'yaml'

/**
 * Reads Compose files the way `docker compose -f a -f b config` merges them, for the tests: maps
 * merge deeply, lists are appended, and the `!reset` and `!override` tags that
 * `compose.local.yaml` uses clear or replace the value of the base file. No Docker needed.
 */
const MARK = Symbol('compose-tag')
type Marked = { [MARK]: '!reset' | '!override'; value: unknown }
const isMarked = (value: unknown): value is Marked =>
  typeof value === 'object' && value !== null && MARK in value

const marked = (tag: '!reset' | '!override', value: unknown): Marked => ({ [MARK]: tag, value })

const collectionTag = (tag: '!reset' | '!override', kind: 'map' | 'seq'): CollectionTag => {
  // toJSON returns the marker instead of the plain value; the base types do not allow that.
  class Map_ extends YAMLMap {
    static tag = tag
    // @ts-expect-error the return type differs on purpose
    toJSON(_: unknown, ctx?: never): Marked {
      return marked(tag, super.toJSON(_ as never, ctx))
    }
  }
  class Seq_ extends YAMLSeq {
    static tag = tag
    // @ts-expect-error the return type differs on purpose
    toJSON(_: unknown, ctx?: never): Marked {
      return marked(tag, super.toJSON(_ as never, ctx))
    }
  }
  const nodeClass = kind === 'map' ? Map_ : Seq_
  return { tag, collection: kind, nodeClass } as unknown as CollectionTag
}

const scalarTag = (tag: '!reset' | '!override'): ScalarTag => ({
  tag,
  resolve: (value: string) => marked(tag, value),
})

const customTags = [
  collectionTag('!reset', 'map'),
  collectionTag('!reset', 'seq'),
  collectionTag('!override', 'map'),
  collectionTag('!override', 'seq'),
  scalarTag('!reset'),
  scalarTag('!override'),
]

export type Service = {
  image?: string
  restart?: string
  mem_limit?: string
  ports?: string[]
  volumes?: string[]
  environment?: Record<string, string>
  env_file?: string | string[]
  healthcheck?: { test?: string[] | string; interval?: string; retries?: number }
  depends_on?: Record<string, { condition?: string }>
  user?: string
  read_only?: boolean
  command?: string[]
  [key: string]: unknown
}

export type Compose = {
  name?: string
  services: Record<string, Service>
  volumes?: Record<string, unknown>
  [key: string]: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !isMarked(value)

function merge(base: unknown, over: unknown): unknown {
  if (isMarked(over)) {
    if (over[MARK] === '!override') return over.value
    return Array.isArray(base) ? [] : isObject(base) ? {} : undefined
  }
  if (Array.isArray(base) && Array.isArray(over)) return [...base, ...over]
  if (isObject(base) && isObject(over)) {
    const out: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(over)) out[key] = merge(base[key], value)
    return out
  }
  return over
}

/** `environment` may be written as a list (`KEY=value`) or a map; the tests want a map. */
function normalise(compose: Compose): Compose {
  for (const service of Object.values(compose.services)) {
    if (Array.isArray(service.environment)) {
      service.environment = Object.fromEntries(
        (service.environment as string[]).map((line) => {
          const at = line.indexOf('=')
          return [line.slice(0, at), line.slice(at + 1)]
        }),
      )
    }
  }
  return compose
}

const parseFile = (file: string): Record<string, unknown> =>
  parse(fs.readFileSync(path.resolve(import.meta.dirname, file), 'utf8'), {
    merge: true,
    customTags,
  }) as Record<string, unknown>

/** The effective configuration of one or more Compose files, later files on top. */
export function loadCompose(...files: string[]): Compose {
  const merged = files.map(parseFile).reduce((base, over) => merge(base, over) as never)
  return normalise(merged as unknown as Compose)
}
