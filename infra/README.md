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

## Media: soft delete, backup, restore (ADR-0006)

Deleting an Image or Video in the `cms` admin (single, bulk or API) removes the record and **moves** its R2 objects (the original and every generated size) to `trash/<key>` in `taha-media`: a copy, then a delete of the live key. If the copy fails, the failure is logged, the live file stays where it was, and the record is still deleted. Code: `packages/cms-config/src/media-trash.ts`, called from `storage.ts`.

- **30-day expiry.** R2 lifecycle rules match by key prefix only and R2 has no object tagging, so the rule is on the prefix `trash/`. `infra/media-trash/lifecycle.json` is that rule in R2's API shape. The Cloudflare script (`infra/cloudflare/settings.sh`) does not manage R2 buckets, so **the owner applies it once at cutover**: dashboard, R2, `taha-media`, Settings, Object lifecycle rules (delete objects under `trash/` 30 days after creation), or `curl -X PUT -H "Authorization: Bearer $TOKEN" --data @infra/media-trash/lifecycle.json https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/r2/buckets/taha-media/lifecycle`. That PUT replaces the bucket's whole rule list. The 30 days count from the move. The backup bucket never gets a lifecycle rule.
- **Backup.** `.github/workflows/media-backup.yml` runs `infra/media-backup/media-backup.sh` nightly: it copies only new keys from `taha-media` to `taha-backup` (`rclone copy --ignore-existing`), skipping `_next/**` and `trash/**`, then checks every listed object is there. It never deletes, so a file the lifecycle rule removed from `trash/` stays in `taha-backup` under its live key. The backup bucket's write key should have no delete permission. Secrets (set at cutover): `R2_ACCOUNT_ID`, `R2_MEDIA_READ_KEY_ID`, `R2_MEDIA_READ_SECRET`, `R2_BACKUP_WRITE_KEY_ID`, `R2_BACKUP_WRITE_SECRET`. Without them the job skips. Our own variables must never start with `RCLONE_` (rclone reads them as flags); only `RCLONE_CONFIG_<remote>_*` is intended.
- **Restore a deleted file.** The record is gone for good, so moving the objects back changes nothing the site can show. Re-upload the original as a new record:
  1. Find the original. Within 30 days it is in `taha-media` under `trash/` (Cloudflare dashboard, R2; names start with the original file name plus a random suffix, and the original is the one without a size suffix such as `-small`). After 30 days, take it from `taha-backup`, same key without `trash/`. A file deleted before the night's backup ran is in `trash/` only, so restore it within the 30 days.
  2. Download it (dashboard, or `rclone copyto SRC:taha-media/trash/<key> .` with a read key).
  3. Upload it in the `cms` admin as a new Image (add the alt text again) or Video (use and poster again), then put it back in the Works that used it.
- **Tests.** `packages/cms-config/src/media-trash.int.test.ts` (copy then delete, record gone, files under `trash/`, failed copy keeps the file) against the S3 stub; `infra/media-trash/lifecycle.test.ts` (rule matches the prefix and 30 days); `infra/media-backup/media-backup.test.ts` against a fake rclone.
