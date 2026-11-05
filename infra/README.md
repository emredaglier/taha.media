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

## Media: soft delete, backup, restore (ADR-0006)

Deleting an Image or Video in the `cms` admin removes the record and **tags** its R2 objects (the original and every generated size) with `deleted-at=<ISO time>`. Nothing is destroyed at that moment. A cleanup then removes objects whose tag is 30 days old. Code: `packages/cms-config/src/media-trash.ts`.

- **Cleanup rule.** `.github/workflows/media-trash-cleanup.yml` runs `node media-trash.ts` nightly with the media bucket's key. Dry run by hand: `S3_ENDPOINT=... S3_BUCKET=taha-media S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... node packages/cms-config/src/media-trash.ts --dry-run` (lists what it would delete). `infra/media-trash/lifecycle.json` is the same rule as an S3 lifecycle configuration, for storage that can filter by tag (`aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration file://infra/media-trash/lifecycle.json`). Check that your R2 account supports tags before relying on either.
- **Backup.** `.github/workflows/media-backup.yml` runs `infra/media-backup/media-backup.sh` nightly: it copies only new keys from `taha-media` to `taha-backup` (`rclone copy --ignore-existing`), then checks every listed object is there. It never deletes, so a file the cleanup removed stays in `taha-backup`. The backup bucket's write key should have no delete permission. Secrets (set at cutover): `R2_ACCOUNT_ID`, `R2_MEDIA_READ_KEY_ID`, `R2_MEDIA_READ_SECRET`, `R2_BACKUP_WRITE_KEY_ID`, `R2_BACKUP_WRITE_SECRET`, `R2_MEDIA_WRITE_KEY_ID`, `R2_MEDIA_WRITE_SECRET`. Without them the jobs skip. Our own variables must never start with `RCLONE_` (rclone reads them as flags); only `RCLONE_CONFIG_<remote>_*` is intended.
- **Restore a deleted file.** The record is gone for good, so putting the objects back changes nothing the site can show. Re-upload the original as a new record:
  1. Find the original. Within 30 days it is still in `taha-media` (Cloudflare dashboard, R2, `taha-media`, with the `deleted-at` tag; names start with the original file name plus a random suffix, and the original is the one without a size suffix such as `-small`). After 30 days take it from `taha-backup`, same key.
  2. Download it (dashboard, or `rclone copyto SRC:taha-media/<key> .` with a read key).
  3. Upload it in the `cms` admin as a new Image (add the alt text again) or Video (use and poster again), then put it back in the Works that used it.
- **Tests.** `packages/cms-config/src/media-trash.int.test.ts` (delete tags, never deletes), `media-trash.test.ts` (30-day rule) against the S3 stub; `infra/media-backup/media-backup.test.ts` against a fake rclone.
