import { spawnSync } from 'node:child_process'
import path from 'node:path'

const makeLoopsScript = path.join(import.meta.dirname, 'make-loops.sh')

const has = (tool: string) => !spawnSync(tool, ['-version'], { stdio: 'ignore' }).error

/**
 * After a dev seed: swap the flat Preview loops and Showreel videos in the database's folder for
 * the moving test-pattern clips (make-loops.sh). Returns the exit code for the seed. Without
 * ffmpeg and ffprobe it only says so (0): the seed data is fine, the loops just stay flat.
 */
export function makeSeedLoops(databasePath: string): number {
  if (!has('ffmpeg') || !has('ffprobe')) {
    console.log(
      'seed: ffmpeg or ffprobe is not installed, so the loops stay flat (brew install ffmpeg, then pnpm seed again).',
    )
    return 0
  }
  const dir = path.dirname(path.resolve(databasePath))
  const result = spawnSync('sh', [makeLoopsScript, dir], { stdio: 'inherit' })
  if (result.status === 0) return 0
  console.error(
    `seed: the seed data is written, but make-loops.sh failed (${result.error?.message ?? `exit ${result.status}`}).`,
  )
  return 1
}
