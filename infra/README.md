# infra

Compose, Caddy, Litestream, deploy and rollback arrive in later tickets. This file is the runbook for the server bootstrap (ADR-0009).

## Server bootstrap: `infra/bootstrap.sh`

Turns a fresh Hetzner ARM VPS (Ubuntu 26.04 LTS) into the Docker host. Not run by tests against a real system; cutover (ADR-0011) runs it once.

What it sets up: an admin user with SSH keys only (no passwords, no root login), Tailscale, ufw with only 80/443 public and SSH on `tailscale0` only, 2G swap, Docker with `live-restore`, `/opt/taha/{data,env}`, security-only unattended upgrades that never reboot or restart the app (Docker packages held back, `needrestart` only lists), and a reboot window at Sunday 04:00 Europe/Istanbul that reboots only when the system says one is required.

### Manual inputs

| Input                  | Flag / env                    | Where it comes from                                                                            |
| ---------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Admin user name        | `--admin-user` / `ADMIN_USER` | Chosen by the owner                                                                            |
| SSH public key(s)      | `--ssh-key` / `SSH_KEY`       | The owner's `.pub` file (a line or a path). Never a private key; the script refuses it         |
| Tailscale auth key     | `TS_AUTHKEY` (env preferred)  | Tailscale admin console, Settings, Keys: one-off, short expiry. Flags show in `ps`, so use env |
| Tailscale machine name | `--hostname` / `TS_HOSTNAME`  | Chosen by the owner; also the MagicDNS name                                                    |

### Run

```
sudo TS_AUTHKEY=tskey-auth-... infra/bootstrap.sh --admin-user NAME --ssh-key ~/key.pub --hostname NAME
```

`--dry-run` prints every action and needs no root. The script is idempotent: re-run it after fixing any error.

### Lockout safety

Public port 22 is closed last, and only after a guard confirms the admin key is installed, Tailscale is Running with an IPv4, `sshd -t` passes and the `tailscale0` SSH rule exists. If the guard fails, SSH stays open and the script stops. If you are locked out anyway: Hetzner Cloud Console (browser console or rescue mode), log in as the admin user, `sudo ufw allow 22/tcp`.

### Tests

`infra/bootstrap.test.ts` runs the script against a fake system: `BOOTSTRAP_ROOT` redirects every written file into a temp dir and recording stubs replace `ufw`, `tailscale`, `systemctl` and the rest on `PATH`.
