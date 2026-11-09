import { execFile } from 'node:child_process'
import net from 'node:net'

export type PortTarget = { name: string; host: string; port: number }
export type PortHolder = { command: string; pid: number; user: string }
export type PortConflict = PortTarget & { holders: PortHolder[] }

/** The distinct processes in `lsof -nP -iTCP:<port> -sTCP:LISTEN` output (header line skipped). */
export function parseLsof(output: string): PortHolder[] {
  const holders = new Map<number, PortHolder>()
  for (const line of output.split('\n').slice(1)) {
    const [command, pid, user] = line.trim().split(/\s+/)
    if (!command || !user || !/^\d+$/.test(pid ?? '')) continue
    holders.set(Number(pid), { command, pid: Number(pid), user })
  }
  return [...holders.values()]
}

/** Who listens on `port`, by `lsof`. Empty when nobody does, or when `lsof` is not installed. */
export function describePortHolder(port: number): Promise<PortHolder[]> {
  return new Promise((resolve) => {
    execFile(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'],
      { encoding: 'utf8' },
      // lsof exits 1 when it finds nothing; either way the output is all that matters.
      (_error, stdout) => resolve(parseLsof(stdout ?? '')),
    )
  })
}

/** Taken when something answers a connection, or when binding it fails. */
function isTaken({ host, port }: PortTarget): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    const notListening = () => {
      socket.destroy()
      const probe = net.createServer()
      probe.once('error', () => resolve(true))
      probe.listen(port, host, () => probe.close(() => resolve(false)))
    }
    socket.once('error', notListening)
    socket.once('timeout', notListening)
  })
}

/** Every target whose port is in use, with what holds it. Checks all of them in one go. */
export async function checkPorts(
  targets: PortTarget[],
  deps: { holders?: (port: number) => Promise<PortHolder[]> } = {},
): Promise<PortConflict[]> {
  const holders = deps.holders ?? describePortHolder
  const conflicts: PortConflict[] = []
  for (const target of targets) {
    if (await isTaken(target)) conflicts.push({ ...target, holders: await holders(target.port) })
  }
  return conflicts
}

export function formatPortConflicts(conflicts: PortConflict[]): string {
  return conflicts
    .map(({ name, host, port, holders }) => {
      const who = holders.length
        ? ` by ${holders.map((h) => `${h.command} (pid ${h.pid}, ${h.user})`).join(', ')}`
        : ' (could not tell which process: lsof found none, or is missing)'
      return `The ${name} port ${host}:${port} is in use${who}`
    })
    .join('\n')
}
