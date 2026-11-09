import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearOutput, saveShots } from './output.ts'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-shaders-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const dataUrl = (text: string) => `data:image/png;base64,${Buffer.from(text).toString('base64')}`

describe('clearOutput', () => {
  it('removes the screenshots of an earlier run and nothing else', () => {
    fs.writeFileSync(path.join(dir, 'cards.png'), 'old')
    fs.writeFileSync(path.join(dir, 'empty.png'), 'old')
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'mine')
    fs.mkdirSync(path.join(dir, 'keep'))
    fs.writeFileSync(path.join(dir, 'keep', 'inner.txt'), 'mine')

    clearOutput(dir)

    expect(fs.readdirSync(dir).sort()).toEqual(['keep', 'notes.txt'])
    expect(fs.readFileSync(path.join(dir, 'keep', 'inner.txt'), 'utf8')).toBe('mine')
  })

  it('does nothing when the directory does not exist yet', () => {
    expect(() => clearOutput(path.join(dir, 'missing'))).not.toThrow()
    expect(fs.existsSync(path.join(dir, 'missing'))).toBe(false)
  })
})

describe('saveShots', () => {
  it('writes each screenshot as a PNG, creating the directory', () => {
    const target = path.join(dir, 'nested', 'out')
    saveShots(target, { cards: dataUrl('card bytes'), empty: dataUrl('empty bytes') })
    expect(fs.readFileSync(path.join(target, 'cards.png'), 'utf8')).toBe('card bytes')
    expect(fs.readFileSync(path.join(target, 'empty.png'), 'utf8')).toBe('empty bytes')
  })
})
