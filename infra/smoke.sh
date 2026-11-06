#!/usr/bin/env bash
# Post-deploy check (ADR-0010, #17). deploy.sh runs it after every swap; exits non-zero if any
# check fails. It is HTTP-only: the full release gate (`pnpm smoke`, Playwright) ran in CI.
#
#   infra/smoke.sh <base-url>        e.g. infra/smoke.sh https://taha.media
#
# Checks, in order:
#   1. home answers 200 (retried for SMOKE_HOME_WAIT seconds: Caddy may still see web as down)
#   2. deployment id: home is `<html data-dpl-id="<id>">` (Next's deploymentId, ADR-0005); with
#      SMOKE_RELEASE set the id must be that release, so a swap that left the old containers
#      serving fails here. A stale tab compares its own id with the server's on its next
#      navigation and reloads the page when they differ; without an id it cannot.
#   3. one static chunk from the home HTML: under <SMOKE_ASSET_ORIGIN>/releases/<id>/_next/static/
#      with ?dpl=<id>, answering 200 with a JavaScript type from the CDN (so the upload happened)
#   4. one Work: the first /isler/<slug> link on home, else on /isler, answers 200
#   5. one R2 file: the first media URL (img/video/source src or poster) on that Work page answers
#      200/206 with an image or video type. It must start with SMOKE_MEDIA_ORIGIN when that is set,
#      else it must be on another origin than the site (media is never served by the VPS).
# 4 and 5 are skipped with a NOTICE while no Work is published (the clean-slate launch).
#
# Env (all optional):
#   SMOKE_RELEASE       expected deployment id (deploy.sh passes the release tag)
#   SMOKE_ASSET_ORIGIN  CDN origin of the static files (default https://cdn.taha.media)
#   SMOKE_MEDIA_ORIGIN  origin (and path prefix) of R2 media URLs, e.g. https://cdn.taha.media
#   SMOKE_RESOLVE       curl --resolve value for the base host, e.g. taha.media:443:127.0.0.1, so
#                       the check hits this server's Caddy, not Cloudflare
#   SMOKE_INSECURE      1 = skip TLS verification for the base host (the Origin CA certificate is
#                       trusted by Cloudflare only)
#   SMOKE_HOME_WAIT     seconds to keep retrying home (default 60)
#   SMOKE_TIMEOUT       per-request timeout in seconds (default 10)
set -euo pipefail

base="${1:?usage: smoke.sh <base-url>}"
base="${base%/}"
release="${SMOKE_RELEASE:-}"
asset_origin="${SMOKE_ASSET_ORIGIN:-https://cdn.taha.media}"
asset_origin="${asset_origin%/}"
media_origin="${SMOKE_MEDIA_ORIGIN:-}"
home_wait="${SMOKE_HOME_WAIT:-60}"
timeout="${SMOKE_TIMEOUT:-10}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

log() { printf 'smoke: %s\n' "$*"; }
fail() {
  printf 'smoke: FAIL %s\n' "$*" >&2
  exit 1
}

# fetch <url> <outfile> [curl args]: prints "<status> <content-type>". The base-host options apply
# only to the base host, so CDN and media requests are verified normally.
fetch() {
  local url="$1" out="$2" opts=()
  shift 2
  if [[ "$url" == "$base"/* || "$url" == "$base" ]]; then
    [[ -n "${SMOKE_RESOLVE:-}" ]] && opts+=(--resolve "$SMOKE_RESOLVE")
    [[ "${SMOKE_INSECURE:-}" == 1 ]] && opts+=(--insecure)
  fi
  local res
  res="$(curl -sS --max-time "$timeout" ${opts[@]+"${opts[@]}"} "$@" -o "$out" \
    -w '%{http_code} %{content_type}' "$url" 2>/dev/null || true)"
  [[ "$res" =~ ^[0-9]{3} ]] || res="000 -"
  [[ "$res" == *' ' ]] && res="${res}-"
  printf '%s\n' "$res"
}

# Absolute URL for a link found in a page served from the base.
absolute() {
  local link="${1//&amp;/&}"
  case "$link" in
    http://* | https://*) printf '%s' "$link" ;;
    //*) printf '%s:%s' "${base%%:*}" "$link" ;;
    /*) printf '%s%s' "$base" "$link" ;;
    *) printf '%s/%s' "$base" "$link" ;;
  esac
}

origin_of() { sed -E 's#^(https?://[^/]+).*#\1#' <<<"$1"; }

# 1. Home.
deadline=$((SECONDS + home_wait))
while :; do
  read -r status _ < <(fetch "$base/" "$tmp/home.html")
  [[ "$status" == 200 ]] && break
  ((SECONDS >= deadline)) && fail "home $base/ answered $status"
  sleep 2
done
log "ok   home $base/"

# 2. Deployment id.
dpl="$(grep -oE '<html[^>]* data-dpl-id="[^"]*"' "$tmp/home.html" | head -n 1 | sed -E 's/.*data-dpl-id="//; s/"$//' || true)"
[[ -n "$dpl" ]] || fail "deployment id: home has no <html data-dpl-id> (deploymentId not set in the build)"
if [[ -n "$release" && "$dpl" != "$release" ]]; then
  fail "deployment id: home is release $dpl, expected $release (the new containers are not serving)"
fi
log "ok   deployment id $dpl"

# 3. One static chunk, on the CDN under this release.
chunk="$(grep -oE 'src="[^"]*/_next/static/[^"]*\.js[^"]*"' "$tmp/home.html" | head -n 1 || true)"
[[ -n "$chunk" ]] || fail "chunk: home links no /_next/static/*.js script"
chunk="$(absolute "$(sed -E 's/^src="//; s/"$//' <<<"$chunk")")"
prefix="$asset_origin/releases/$dpl/_next/static/"
[[ "$chunk" == "$prefix"* ]] || fail "chunk $chunk is not under $prefix"
[[ "$chunk" =~ [?\&]dpl=$dpl(\&|$) ]] || fail "chunk $chunk has no ?dpl=$dpl"
read -r status type < <(fetch "$chunk" "$tmp/chunk.js")
[[ "$status" == 200 ]] || fail "chunk $chunk answered $status"
[[ "$type" =~ (java|ecma)script ]] || fail "chunk $chunk has content type $type"
log "ok   chunk $chunk"

# 4. One Work: a link on home, else on the Works list.
work_link() { grep -oE 'href="(https?://[^/"]+)?/isler/[^"/?#]+"' "$1" | head -n 1 | sed -E 's/^href="//; s/"$//; s#^https?://[^/]+##' || true; }
work="$(work_link "$tmp/home.html")"
if [[ -z "$work" ]]; then
  read -r status _ < <(fetch "$base/isler" "$tmp/isler.html")
  [[ "$status" == 200 ]] && work="$(work_link "$tmp/isler.html")"
fi
if [[ -z "$work" ]]; then
  log "NOTICE no Work published (no /isler/<slug> link on home or /isler): Work and R2 file checks skipped"
  log "smoke passed"
  exit 0
fi
work="$(absolute "$work")"
read -r status _ < <(fetch "$work" "$tmp/work.html")
[[ "$status" == 200 ]] || fail "work $work answered $status"
log "ok   work $work"

# 5. One R2 file shown on that Work page.
media=""
while IFS= read -r candidate; do
  url="${candidate//&amp;/&}"
  [[ "$url" == */_next/* ]] && continue
  if [[ -n "$media_origin" ]]; then
    [[ "$url" == "$media_origin"/* ]] || continue
  else
    [[ "$(origin_of "$url")" != "$(origin_of "$base")" ]] || continue
  fi
  media="$url"
  break
done < <(grep -oE '<(img|video|source)[^>]*>' "$tmp/work.html" | grep -oE ' (src|poster)="https?://[^"]+"' | sed -E 's/^ (src|poster)="//; s/"$//' || true)
[[ -n "$media" ]] || fail "r2 file: work $work shows no media from ${media_origin:-another origin}"
read -r status type < <(fetch "$media" "$tmp/media" -r 0-1023)
[[ "$status" == 200 || "$status" == 206 ]] || fail "r2 file $media answered $status"
[[ "$type" == image/* || "$type" == video/* ]] || fail "r2 file $media has content type $type"
log "ok   r2 file $media"

log "smoke passed"
