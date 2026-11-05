# 9. Docker Compose + Caddy on the existing Hetzner ARM VPS, rebuilt by script

Date: 2026-11-05 · Status: accepted (adapted from daglier.com ADR-0004)

taha.media runs on its own server: the Hetzner ARM (arm64) VPS that already exists for it, not daglier.com's server. The server is wiped and rebuilt by `infra/bootstrap.sh`: Ubuntu 26.04 LTS, SSH keys only, SSH over Tailscale only, ufw with only 80/443 public, swap, Docker. Docker Compose runs `caddy`, `web`, `web-preview`, `cms` and `litestream` with memory limits, health checks and `restart: unless-stopped`. Security updates install automatically, the app never restarts on its own, and reboots happen only in a Sunday 04:00 Europe/Istanbul window. Nothing is built on the server.

## Consequences

Every image must be built for `linux/arm64` (ADR-0010). Whatever runs on the server today, including the current site at taha.media, is backed up and removed during the rebuild, and the site is offline until the first deploy.
