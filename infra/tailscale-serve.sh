#!/usr/bin/env bash
# Expose cms and the preview instance on the tailnet only, with HTTPS from `tailscale serve`
# (ADR-0001). Idempotent: re-running replaces the same mappings.
#
# Loopback ports must match infra/compose.yaml (infra/tailscale-serve.test.ts checks it); override
# with env vars and keep both in sync.
set -euo pipefail

CMS_PORT="${CMS_PORT:-3001}"         # cms         -> https://<name>.<tailnet>.ts.net:9443/
PREVIEW_PORT="${PREVIEW_PORT:-3002}" # web-preview -> https://<name>.<tailnet>.ts.net:8443/
# Not 443: Caddy publishes it, and tailscaled starts before Docker on a reboot, so a serve on 443
# can make Docker fail to bind Caddy and take the public site down.
CMS_HTTPS_PORT="${CMS_HTTPS_PORT:-9443}"
PREVIEW_HTTPS_PORT="${PREVIEW_HTTPS_PORT:-8443}"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h | --help)
      echo "Usage: infra/tailscale-serve.sh [--dry-run]"
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

for p in "$CMS_PORT" "$PREVIEW_PORT" "$CMS_HTTPS_PORT" "$PREVIEW_HTTPS_PORT"; do
  if ! [[ "$p" =~ ^[0-9]+$ ]] || ((p < 1 || p > 65535)); then
    echo "invalid port: $p" >&2
    exit 2
  fi
done
if [[ "$CMS_HTTPS_PORT" == 443 || "$PREVIEW_HTTPS_PORT" == 443 ]]; then
  echo "port 443 belongs to Caddy" >&2
  exit 2
fi

run() {
  if ((DRY_RUN)); then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

if ! ((DRY_RUN)); then
  command -v tailscale >/dev/null 2>&1 || {
    echo "tailscale is not installed; run infra/bootstrap.sh first" >&2
    exit 1
  }
  tailscale status --json 2>/dev/null | grep -Eq '"BackendState": *"Running"' || {
    echo "tailscale is not up" >&2
    exit 1
  }
fi

# --bg keeps the mapping across reboots; the same --https port replaces its mapping.
run tailscale serve --bg --https="$CMS_HTTPS_PORT" "http://127.0.0.1:$CMS_PORT"
run tailscale serve --bg --https="$PREVIEW_HTTPS_PORT" "http://127.0.0.1:$PREVIEW_PORT"

if ! ((DRY_RUN)); then
  tailscale serve status
fi
