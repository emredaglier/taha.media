# infra

Compose, Caddy, Litestream, deploy and rollback arrive in later tickets. This file is the runbook for the server bootstrap (ADR-0009).

## Revalidation (input for the Compose and Caddy ticket, #15)

`cms` tells `web` which cache tags a publish touched by POSTing to `web`'s `/internal/revalidate` (ADR-0001, ADR-0012). Requirements:

- **Internal only.** `cms` (and `migrate`, when it seeds) use `REVALIDATE_URL=http://web:3000/internal/revalidate` on the internal Docker network. Caddy must answer `/internal/*` with 404 on every public host, so the route is never reachable from the internet. The smoke spec checks this.
- **Shared secret.** `REVALIDATE_SECRET` holds the same value on `cms`, `migrate` and `web`. The route rejects a missing or wrong secret with 401, and it rejects every request while `web` has no secret set.
- **Not `web-preview`.** The preview instance (`PREVIEW=1`) never caches reads, so it needs no notification.

Tag names live in `packages/cms-config/src/tags.ts`. To refresh by hand (for example after editing the database directly), POST `{"tags":["works","home","page:site"]}` with the `x-revalidate-secret` header from inside the `web` container.

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
