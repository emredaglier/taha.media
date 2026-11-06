// Shared scaffolding for the infra tests (Seam 3): a throwaway directory per test with fake
// binaries first on PATH, and the logs those fakes write. No Docker, R2 or network.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

/** A file of the repo as text, by its path from the repo root (`infra/caddy/site.caddy`). */
export const read = (file: string): string => fs.readFileSync(path.join(repoRoot, file), 'utf8')

export type Sandbox = {
  /** The temp directory itself. */
  dir: string
  /** `<dir>/bin`, where `fake` writes; first on `PATH`. */
  bin: string
  /** `PATH` with the fakes ahead of the real tools. */
  PATH: string
  /** A path inside the sandbox. */
  path: (...parts: string[]) => string
  /** Writes an executable fake into `bin`; `script` is the whole file, shebang included. */
  fake: (name: string, script: string) => void
  /** A file inside the sandbox, as text. */
  read: (file: string) => string
  /** The non-empty lines of a log inside the sandbox (default `calls`); none when it is missing. */
  calls: (file?: string) => string[]
  /** Deletes the sandbox. */
  remove: () => void
}

/** Creates a sandbox under the OS temp directory, named `<prefix>XXXXXX`. */
export function sandbox(prefix: string): Sandbox {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  const inside = (...parts: string[]) => path.join(dir, ...parts)
  return {
    dir,
    bin,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    path: inside,
    fake: (name, script) => fs.writeFileSync(path.join(bin, name), script, { mode: 0o755 }),
    read: (file) => fs.readFileSync(inside(file), 'utf8'),
    calls: (file = 'calls') => {
      const log = inside(file)
      if (!fs.existsSync(log)) return []
      return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
    },
    remove: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}
