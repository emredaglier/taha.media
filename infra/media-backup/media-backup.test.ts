import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { read, sandbox, type Sandbox } from '../test-helpers.ts'

// Seam 3 (spec #1): infra/media-backup/media-backup.sh against a fake rclone. The fake keeps each
// remote's buckets as folders and implements only what the script may use (lsf, copy, check). Any
// other subcommand, or a delete-like flag, makes it fail and is recorded.

const script = new URL('./media-backup.sh', import.meta.url).pathname

const fakeRclone = `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$FAKE_ROOT/calls.log"
touch "$FAKE_ROOT/stray-rclone-env.log"
env | grep '^RCLONE_' | grep -v '^RCLONE_CONFIG_' >> "$FAKE_ROOT/stray-rclone-env.log" || true
cmd="$1"; shift
for a in "$@"; do
  case "$a" in
    --delete*|--remove*|--purge*|--backup-dir*|--immutable-flag-none) echo "forbidden flag $a" >&2; exit 90 ;;
  esac
done
dir() { case "$1" in SRC:*) echo "$FAKE_ROOT/src/\${1#SRC:}" ;; DST:*) echo "$FAKE_ROOT/dst/\${1#DST:}" ;; esac; }
# Honours the --exclude 'prefix/**' patterns the script passes (and nothing it does not pass).
excludes=()
prev=""
for a in "$@"; do [ "$prev" = --exclude ] && excludes+=("\${a%/\\*\\*}/"); prev="$a"; done
excluded() { for p in "\${excludes[@]:-}"; do [ -n "$p" ] && case "$1" in "$p"*) return 0 ;; esac; done; return 1; }
case "$cmd" in
  lsf)
    remote="\${@: -1}"
    (cd "$(dir "$remote")" && find . -type f | sed 's|^\\./||' | sort) | while read -r f; do excluded "$f" || echo "$f"; done ;;
  copy)
    s="$(dir "$1")"; d="$(dir "$2")"; mkdir -p "$d"
    (cd "$s" && find . -type f | sed 's|^\\./||') | while read -r f; do
      excluded "$f" && continue
      if [ ! -e "$d/$f" ]; then mkdir -p "$(dirname "$d/$f")"; cp "$s/$f" "$d/$f"; fi
    done ;;
  check)
    s="$(dir "$1")"; d="$(dir "$2")"; list=""
    while [ $# -gt 0 ]; do [ "$1" = --files-from ] && list="$2"; shift; done
    rc=0
    while read -r f; do
      [ -e "$d/$f" ] && [ "$(wc -c <"$s/$f")" = "$(wc -c <"$d/$f")" ] || { echo "missing $f" >&2; rc=1; }
    done < "$list"
    exit $rc ;;
  *) echo "forbidden rclone subcommand: $cmd" >&2; exit 91 ;;
esac
`

let sb: Sandbox
let root: string

function put(side: 'src' | 'dst', bucket: string, key: string, body: string) {
  const file = join(root, side, bucket, key)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body)
}

function files(side: 'src' | 'dst', bucket: string): string[] {
  const base = join(root, side, bucket)
  if (!existsSync(base)) return []
  return (readdirSync(base, { recursive: true, withFileTypes: true }) as import('node:fs').Dirent[])
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(base.length + 1))
    .sort()
}

function run() {
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      PATH: sb.PATH,
      HOME: root,
      FAKE_ROOT: root,
      SRC_BUCKET: 'media',
      DST_BUCKET: 'backup',
      WORK_DIR: join(root, 'work'),
      // The caller's remote config, as the workflow sets it; must not trip the fake.
      RCLONE_CONFIG_SRC_TYPE: 's3',
      RCLONE_CONFIG_DST_TYPE: 's3',
    },
  })
}

beforeEach(() => {
  sb = sandbox('media-backup-')
  root = sb.dir
  mkdirSync(join(root, 'work'))
  sb.fake('rclone', fakeRclone)
})

afterEach(() => sb.remove())

describe('media-backup.sh', () => {
  test('copies only new objects and leaves existing backup objects untouched', () => {
    put('src', 'media', 'a.webp', 'AAAA')
    put('src', 'media', 'b.webp', 'BBBB')
    // Same size, different bytes: a rewrite would be visible, and the size-only check still passes.
    put('dst', 'backup', 'a.webp', 'OLD1')
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(files('dst', 'backup')).toEqual(['a.webp', 'b.webp'])
    expect(sb.read('dst/backup/a.webp')).toBe('OLD1')
    expect(sb.read('dst/backup/b.webp')).toBe('BBBB')
  })

  test('never deletes: an object gone from the media bucket stays in the backup', () => {
    put('src', 'media', 'kept.webp', 'K')
    put('dst', 'backup', 'removed-after-30-days.webp', 'R')
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(files('dst', 'backup')).toContain('removed-after-30-days.webp')
    expect(files('src', 'media')).toEqual(['kept.webp'])
  })

  test('uses only lsf, copy and check, with no delete-like flag, and skips static assets and trash/', () => {
    put('src', 'media', 'a.webp', 'A')
    put('src', 'media', '_next/static/x.js', 'JS')
    put('src', 'media', 'trash/deleted.webp', 'D')
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    const calls = sb.calls('calls.log')
    expect(calls.map((c) => c.split(' ')[0]).sort()).toEqual(['check', 'copy', 'lsf'])
    for (const c of calls) expect(c).not.toMatch(/delete|purge|remove|\bsync\b|\bmove/i)
    expect(files('dst', 'backup')).toEqual(['a.webp'])
  })

  test('fails when an object cannot be verified in the backup', () => {
    put('src', 'media', 'a.webp', 'A')
    // A fake copy that silently drops files: the check must catch it.
    sb.fake('rclone', fakeRclone.replace('copy)', 'copy) exit 0 ;;\n  copy_unused)'))
    const r = run()
    expect(r.status).not.toBe(0)
  })

  test('sets no RCLONE_* variable of its own (rclone would read it as a flag)', () => {
    put('src', 'media', 'a.webp', 'A')
    run()
    expect(sb.read('stray-rclone-env.log')).toBe('')
    expect(read('infra/media-backup/media-backup.sh')).not.toMatch(
      /^\s*(export\s+)?RCLONE_(?!CONFIG_)[A-Z_]+=/m,
    )
  })
})
