import { spawnSync } from 'node:child_process'
import net from 'node:net'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { checkPorts, describePortHolder, formatPortConflicts, parseLsof } from './ports.ts'

const servers: net.Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))))
})

const listen = (host = '127.0.0.1') =>
  new Promise<number>((resolve) => {
    const server = net.createServer()
    servers.push(server)
    server.listen(0, host, () => resolve((server.address() as AddressInfo).port))
  })

describe('parseLsof', () => {
  const output = [
    'COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
    'node    12345 emre   22u  IPv4 0x1234567890abcdef      0t0  TCP 127.0.0.1:3000 (LISTEN)',
    'node    12345 emre   23u  IPv6 0x1234567890abcdee      0t0  TCP [::1]:3000 (LISTEN)',
    'Google    999 emre   40u  IPv4 0x1234567890abcdea      0t0  TCP *:3000 (LISTEN)',
  ].join('\n')

  it('names each distinct process once, with its pid, user and command', () => {
    expect(parseLsof(output)).toEqual([
      { command: 'node', pid: 12345, user: 'emre' },
      { command: 'Google', pid: 999, user: 'emre' },
    ])
  })

  it('is empty for no output', () => {
    expect(parseLsof('')).toEqual([])
  })
})

describe('checkPorts', () => {
  it('reports nothing for free ports', async () => {
    const free = await listen()
    // Free it again: a port a moment ago in use is free now.
    await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))))
    expect(await checkPorts([{ name: 'web', host: '127.0.0.1', port: free }])).toEqual([])
  })

  it('reports a taken port with its name and what holds it', async () => {
    const port = await listen()
    const holders = [{ command: 'node', pid: 4242, user: 'emre' }]
    const conflicts = await checkPorts([{ name: 'media', host: '127.0.0.1', port }], {
      holders: async () => holders,
    })
    expect(conflicts).toEqual([{ name: 'media', host: '127.0.0.1', port, holders }])
  })

  it('checks every port, so one run lists all the conflicts', async () => {
    const a = await listen()
    const b = await listen()
    const conflicts = await checkPorts(
      [
        { name: 'web', host: '127.0.0.1', port: a },
        { name: 'media', host: '127.0.0.1', port: b },
      ],
      { holders: async () => [] },
    )
    expect(conflicts.map((c) => c.name)).toEqual(['web', 'media'])
  })

  it('formats a conflict with the process, and without one says it could not tell', () => {
    const text = formatPortConflicts([
      {
        name: 'web',
        host: '127.0.0.1',
        port: 3000,
        holders: [{ command: 'node', pid: 12345, user: 'emre' }],
      },
      { name: 'media', host: '127.0.0.1', port: 4100, holders: [] },
    ])
    expect(text).toContain('web port 127.0.0.1:3000 is in use by node (pid 12345, emre)')
    expect(text).toContain('media port 127.0.0.1:4100 is in use')
    expect(text).toMatch(/could not tell which process/i)
  })
})

const hasLsof = spawnSync('lsof', ['-v']).error === undefined

describe('describePortHolder', () => {
  it.skipIf(!hasLsof)('finds this process as the holder of a port it listens on', async () => {
    const port = await listen()
    const holders = await describePortHolder(port)
    expect(holders.map((h) => h.pid)).toContain(process.pid)
  })

  it('is empty for a port nobody listens on', async () => {
    const free = await listen()
    await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))))
    expect(await describePortHolder(free)).toEqual([])
  })
})
