// The shader check's screenshot on disk. It only ever touches the file it writes, because
// the directory can come from CHECK_SHADERS_OUTPUT_DIR and may hold anything.
import fs from 'node:fs'
import path from 'node:path'

const SHOTS = ['room'] as const

/** Removes the screenshots of an earlier run from `outputDir`, and nothing else in it. */
export function clearOutput(outputDir: string): void {
  for (const name of SHOTS) fs.rmSync(path.join(outputDir, `${name}.png`), { force: true })
}

/** Writes each frame's data URL as `<name>.png` in `outputDir`, creating the directory. */
export function saveShots(outputDir: string, shots: Record<(typeof SHOTS)[number], string>): void {
  fs.mkdirSync(outputDir, { recursive: true })
  for (const name of SHOTS) {
    const dataUrl = shots[name]
    fs.writeFileSync(
      path.join(outputDir, `${name}.png`),
      Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'),
    )
  }
}
