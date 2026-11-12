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

/**
 * A port nobody listens on, from 20000-29999: below the ports the OS hands out by itself (Linux
 * from 32768, macOS from 49152), which every `listen(0)` and outgoing connection on the machine
 * draws from. A port from that pool, freed again, can go to another process's socket before the
 * check runs (#94); this one can only be taken by a process that asks for its number. Both probes:
 * on macOS a bind to 127.0.0.1 succeeds even while another process listens on 0.0.0.0.
 */
const host = '127.0.0.1'
const bindable = (port: number) =>
  new Promise<boolean>((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, host, () => server.close(() => resolve(true)))
  })
const answers = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(port, host)
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('error', () => resolve(false))
  })
const unusedPort = async (): Promise<number> => {
  for (;;) {
    const port = 20_000 + Math.floor(Math.random() * 10_000)
    if ((await bindable(port)) && !(await answers(port))) return port
  }
}

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
    const free = await unusedPort()
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
    expect(await describePortHolder(await unusedPort())).toEqual([])
  })
})
