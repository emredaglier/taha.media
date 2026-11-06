import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { sandbox, type Sandbox } from './test-helpers.ts'

// Seam: infra/bootstrap.sh run against a fake system. Every file lands under
// BOOTSTRAP_ROOT and every system command is a recording stub on PATH, so the
// script never touches this machine.

const script = new URL('./bootstrap.sh', import.meta.url).pathname
const PUBLIC_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SsZiPQsAOCDvqtiITEmg0Wn0Kb1bWqXz taha@laptop'

const stubs: Record<string, string> = {
  // Stateful ufw: remembers rules, prints them like `ufw status`.
  ufw: `
rules="$FAKE_STATE/ufw.rules"
touch "$rules"
case "$1" in
  status)
    if [ -f "$FAKE_STATE/ufw.enabled" ]; then echo "Status: active"; else echo "Status: inactive"; fi
    cat "$rules" ;;
  default) echo "default $2 $3" >>"$FAKE_STATE/ufw.defaults" ;;
  allow)
    shift
    if [ "$1" = in ]; then line="$7/tcp on $3 ALLOW Anywhere"; else line="$1 ALLOW Anywhere"; fi
    grep -qxF "$line" "$rules" || echo "$line" >>"$rules" ;;
  delete)
    grep -v '^22/tcp ALLOW' "$rules" >"$rules.new"; mv "$rules.new" "$rules" ;;
  --force)
    if [ "$2" = enable ]; then touch "$FAKE_STATE/ufw.enabled"; fi
    if [ "$2" = delete ]; then grep -v '^22/tcp ALLOW' "$rules" >"$rules.new"; mv "$rules.new" "$rules"; fi ;;
esac`,
  tailscale: `
case "$1" in
  status) if [ -f "$FAKE_STATE/ts.up" ]; then echo '{"BackendState": "Running"}'; fi ;;
  ip) if [ -f "$FAKE_STATE/ts.up" ]; then echo 100.64.0.1; fi ;;
  up) touch "$FAKE_STATE/ts.up" ;;
esac`,
  docker: 'exit 0',
  sshd: 'exit 0',
  visudo: 'exit 0',
  chown: 'exit 0',
  adduser: 'exit 0',
  usermod: 'exit 0',
  apt_get: 'exit 0',
  systemctl: 'exit 0',
  timedatectl: 'exit 0',
  sysctl: 'exit 0',
  swapon: 'exit 0',
  mkswap: 'exit 0',
  fallocate: 'f="${3}"; : >"$f"',
  curl: 'exit 0',
  id: 'exit 1',
  getent: 'exit 0',
  dpkg: 'echo arm64',
}

let sb: Sandbox
let root: string
let state: string

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      PATH: sb.PATH,
      HOME: root,
      BOOTSTRAP_ROOT: root,
      FAKE_STATE: state,
      TS_AUTHKEY: 'tskey-auth-fake',
      ...env,
    },
  })
}

function runOk() {
  const result = run(baseArgs())
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
}

const baseArgs = () => ['--admin-user', 'taha', '--ssh-key', PUBLIC_KEY, '--hostname', 'taha-media']
const read = (path: string) => sb.read(join('root', path))
const ufwRules = () => sb.read('state/ufw.rules')

beforeEach(() => {
  sb = sandbox('bootstrap-')
  root = sb.path('root')
  state = sb.path('state')
  for (const dir of [root, state, join(root, 'etc')]) mkdirSync(dir, { recursive: true })
  for (const [name, body] of Object.entries(stubs)) {
    sb.fake(name.replace('_', '-'), `#!/bin/sh\n${body}\n`)
  }
})

afterEach(() => sb.remove())

describe('bootstrap.sh on a fake system', () => {
  test('exits with a usage error and changes nothing when inputs are missing', () => {
    const result = run([], { TS_AUTHKEY: '' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('missing required input')
    expect(existsSync(join(root, 'etc/ssh'))).toBe(false)
  })

  test('opens only 80/443 publicly and SSH on tailscale0 only; public 22 is closed', () => {
    const result = run(baseArgs())
    expect(result.status, result.stderr).toBe(0)
    expect(sb.read('state/ufw.defaults')).toContain('default deny incoming')
    expect(ufwRules().trim().split('\n').sort()).toEqual([
      '22/tcp on tailscale0 ALLOW Anywhere',
      '443/tcp ALLOW Anywhere',
      '80/tcp ALLOW Anywhere',
    ])
    expect(existsSync(join(state, 'ufw.enabled'))).toBe(true)
  })

  test('keeps public SSH open and fails when Tailscale never comes up (lockout guard)', () => {
    sb.fake('tailscale', '#!/bin/sh\nexit 1\n')
    const result = run(baseArgs())
    expect(result.status).not.toBe(0)
    expect(ufwRules()).toContain('22/tcp ALLOW Anywhere')
  })

  test('allows only key login for the admin user', () => {
    runOk()
    const sshd = read('etc/ssh/sshd_config.d/00-taha.conf')
    expect(sshd).toContain('PasswordAuthentication no')
    expect(sshd).toContain('PermitRootLogin no')
    expect(sshd).toContain('AllowUsers taha')
    expect(read('home/taha/.ssh/authorized_keys')).toBe(`${PUBLIC_KEY}\n`)
  })

  test('installs security updates only, never restarts the app, reboots Sunday 04:00 Istanbul', () => {
    runOk()
    const upgrades = read('etc/apt/apt.conf.d/52taha-unattended')
    expect(upgrades).toContain('-security')
    expect(upgrades).toContain('Unattended-Upgrade::Automatic-Reboot "false"')
    for (const pkg of ['docker-ce', 'containerd.io', 'docker-compose-plugin']) {
      expect(upgrades).toContain(`"${pkg}"`)
    }
    expect(read('etc/needrestart/conf.d/50-taha.conf')).toContain("$nrconf{restart} = 'l'")
    const timer = read('etc/systemd/system/taha-reboot.timer')
    expect(timer).toContain('OnCalendar=Sun *-*-* 04:00:00 Europe/Istanbul')
    expect(read('usr/local/sbin/taha-reboot-if-needed')).toContain('/var/run/reboot-required')
  })

  test('configures swap and Docker with live-restore so daemon reloads keep containers', () => {
    runOk()
    expect(read('etc/fstab')).toContain('/swapfile none swap sw 0 0')
    expect(read('etc/sysctl.d/60-taha-swap.conf')).toContain('vm.swappiness=10')
    expect(JSON.parse(read('etc/docker/daemon.json'))['live-restore']).toBe(true)
    expect(existsSync(join(root, 'opt/taha/env'))).toBe(true)
  })

  test('is idempotent: a second run succeeds and leaves identical config', () => {
    runOk()
    const files = [
      'etc/ssh/sshd_config.d/00-taha.conf',
      'etc/apt/apt.conf.d/52taha-unattended',
      'etc/systemd/system/taha-reboot.timer',
      'etc/fstab',
      'home/taha/.ssh/authorized_keys',
    ]
    const before = files.map(read)
    const rules = ufwRules()
    runOk()
    expect(files.map(read)).toEqual(before)
    expect(ufwRules()).toBe(rules)
  })

  test('refuses a private key', () => {
    const result = run([
      '--admin-user',
      'taha',
      '--ssh-key',
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      '--hostname',
      'h',
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('private key')
  })
})
