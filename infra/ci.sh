#!/usr/bin/env bash
# Every delivery step of CI as a script you can read and run (ADR-0010, #17). The workflow
# (.github/workflows/ci.yml) only orchestrates: checkout, tool setup, then one call here.
#
#   infra/ci.sh lint-workflows   actionlint on .github/workflows (local binary, else Docker)
#   infra/ci.sh build <sha>      web, cms and migrate images for linux/arm64, tagged <sha>, with the
#                                release's assetPrefix and deploymentId (infra/assets.sh build-args)
#   infra/ci.sh smoke <sha>      the release gate (`pnpm smoke`) against the built web image
#   infra/ci.sh publish <sha>    push the <sha> tags; print each digest as
#                                <target>=<prefix>/<target>@sha256:... (also to $GITHUB_OUTPUT)
#   infra/ci.sh gate <group>     ready=true|false (also to $GITHUB_OUTPUT): are the secrets of
#                                <group> (upload | deploy) all set? Missing ones are a ::warning
#   infra/ci.sh upload <sha>     /_next/static of $WEB_IMAGE (a published digest) to R2
#   infra/ci.sh push <sha>       move the `main` tags to $WEB_IMAGE, $CMS_IMAGE, $MIGRATE_IMAGE
#                                (published digests), registry-side, without pulling
#   infra/ci.sh deploy <sha>     copy infra/ to the server as releases/<sha>/, run its deploy.sh,
#                                then prune static releases older than 30 days except the live ones
#
# Env:
#   IMAGE_PREFIX     default ghcr.io/<GITHUB_REPOSITORY_OWNER, lowercased>/taha, else `taha`
#   CDN_ORIGIN       default https://cdn.taha.media (assets.sh)
#   CI_PLATFORM      build: default linux/arm64 (the server's platform, ADR-0009)
#   CI_BUILD_CACHE_DIR  build: local buildx cache directory (CI restores it with actions/cache)
#   ASSETS_BUCKET    upload, deploy: R2 bucket behind cdn.taha.media, default taha-media
#   R2_ACCOUNT_ID, R2_ASSETS_WRITE_KEY_ID, R2_ASSETS_WRITE_SECRET   upload, deploy (prune)
#   GHCR_TOKEN, GITHUB_ACTOR                                         publish, upload, push, deploy
#   WEB_IMAGE, CMS_IMAGE, MIGRATE_IMAGE   upload (web only), push: the digests publish printed
#   DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_HOST_KEY        deploy
#   DEPLOY_DIR       directory on the server, default /opt/taha/infra
# Secrets and variables: infra/README.md, "CI and deploy".
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
targets=(web cms migrate)
ACTIONLINT_IMAGE="rhysd/actionlint:1.7.7"

die() { echo "ci.sh: $*" >&2; exit 1; }
log() { echo "[ci] $*"; }
sha_arg() { [[ "${1:-}" =~ ^[0-9a-f]{7,40}$ ]] || die "usage: ci.sh $cmd <git sha>"; }

prefix() {
  if [ -n "${IMAGE_PREFIX:-}" ]; then echo "$IMAGE_PREFIX"
  elif [ -n "${GITHUB_REPOSITORY_OWNER:-}" ]; then echo "ghcr.io/${GITHUB_REPOSITORY_OWNER,,}/taha"
  else echo "taha"; fi
}

# Log in to the registry of the image prefix (ghcr.io in CI) with the job's token.
registry_login() {
  : "${GHCR_TOKEN:?}" "${GITHUB_ACTOR:?}"
  local p; p="$(prefix)"
  printf '%s' "$GHCR_TOKEN" | docker login "${p%%/*}" -u "$GITHUB_ACTOR" --password-stdin
}

# The S3 settings release-assets.ts reads, for the bucket behind cdn.taha.media.
assets_env() {
  : "${R2_ACCOUNT_ID:?}" "${R2_ASSETS_WRITE_KEY_ID:?}" "${R2_ASSETS_WRITE_SECRET:?}"
  export S3_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" S3_BUCKET="${ASSETS_BUCKET:-taha-media}"
  export S3_ACCESS_KEY_ID="$R2_ASSETS_WRITE_KEY_ID" S3_SECRET_ACCESS_KEY="$R2_ASSETS_WRITE_SECRET"
}

# A group is ready only when every variable in it is non-empty.
group_vars() {
  case "$1" in
    upload) echo R2_ACCOUNT_ID R2_ASSETS_WRITE_KEY_ID R2_ASSETS_WRITE_SECRET ;;
    deploy) echo DEPLOY_HOST DEPLOY_USER DEPLOY_SSH_KEY DEPLOY_HOST_KEY TS_OAUTH_CLIENT_ID TS_OAUTH_SECRET \
              R2_ACCOUNT_ID R2_ASSETS_WRITE_KEY_ID R2_ASSETS_WRITE_SECRET ;;
    *) die "unknown gate group '$1' (upload | deploy)" ;;
  esac
}

cmd="${1:-}"
if [ $# -gt 0 ]; then shift; fi

case "$cmd" in
  lint-workflows)
    cd "$root"
    if command -v actionlint >/dev/null 2>&1; then
      actionlint .github/workflows/*.yml
    else
      docker run --rm -v "$root:/repo" -w /repo "$ACTIONLINT_IMAGE" -color
    fi
    ;;

  build)
    sha_arg "${1:-}"; sha="$1"; p="$(prefix)"
    cd "$root"
    read -ra args <<<"$("$here/assets.sh" build-args "$sha")"
    cache=()
    if [ -n "${CI_BUILD_CACHE_DIR:-}" ]; then
      mkdir -p "$CI_BUILD_CACHE_DIR"
      cache=(--cache-from "type=local,src=$CI_BUILD_CACHE_DIR" --cache-to "type=local,dest=$CI_BUILD_CACHE_DIR.new,mode=max")
    fi
    # The same build args for every target keep the shared `build` stage one cached layer; only
    # web reads them. The cache is rotated afterwards, or it grows with every run.
    for t in "${targets[@]}"; do
      log "building $t for ${CI_PLATFORM:-linux/arm64}"
      docker buildx build --platform "${CI_PLATFORM:-linux/arm64}" --target "$t" "${args[@]}" \
        ${cache[@]+"${cache[@]}"} -t "$p/$t:$sha" --load .
    done
    if [ -n "${CI_BUILD_CACHE_DIR:-}" ] && [ -d "$CI_BUILD_CACHE_DIR.new" ]; then
      rm -rf "$CI_BUILD_CACHE_DIR"
      mv "$CI_BUILD_CACHE_DIR.new" "$CI_BUILD_CACHE_DIR"
    fi
    ;;

  smoke)
    sha_arg "${1:-}"; sha="$1"
    cd "$root"
    # The browser asks the CDN prefix the image was built with for /_next/; smoke/network.ts
    # answers those from the container (nothing is uploaded before the gate passes). The spec
    # checks that every page names this deployment id. A failure here stops the run: nothing is
    # published, uploaded or deployed (infra/README.md, "CI and deploy").
    SMOKE_WEB_IMAGE="$(prefix)/web:$sha" \
      SMOKE_ASSET_PREFIX="${CDN_ORIGIN:-https://cdn.taha.media}/releases/$sha" \
      SMOKE_DEPLOYMENT_ID="$sha" \
      pnpm smoke
    ;;

  publish)
    sha_arg "${1:-}"; sha="$1"; p="$(prefix)"
    registry_login
    # The digest `docker push` ends with is the one the registry stores: later jobs pull and tag
    # exactly that, so the deployed bytes are the smoke-tested ones.
    for t in "${targets[@]}"; do
      out="$(docker push "$p/$t:$sha")" || die "docker push $p/$t:$sha failed"
      echo "$out"
      digest="$(sed -n 's/.*digest: \(sha256:[0-9a-f]\{64\}\).*/\1/p' <<<"$out" | tail -1)"
      [ -n "$digest" ] || die "no digest in the output of docker push $p/$t:$sha"
      log "$t: $p/$t@$digest"
      if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "$t=$p/$t@$digest" >>"$GITHUB_OUTPUT"; fi
    done
    ;;

  gate)
    group="${1:-}"; [ -n "$group" ] || die "usage: ci.sh gate <upload|deploy>"
    names="$(group_vars "$group")" || exit 1
    missing=()
    for v in $names; do [ -n "${!v:-}" ] || missing+=("$v"); done
    if [ ${#missing[@]} -gt 0 ]; then
      echo "::warning title=$group skipped::secrets not set yet: ${missing[*]} (infra/README.md, \"CI and deploy\")"
      ready=false
    else
      ready=true
    fi
    echo "ready=$ready"
    if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "ready=$ready" >>"$GITHUB_OUTPUT"; fi
    ;;

  upload)
    sha_arg "${1:-}"; sha="$1"; p="$(prefix)"
    [[ "${WEB_IMAGE:-}" =~ ^"$p/web"@sha256:[0-9a-f]{64}$ ]] || die "WEB_IMAGE must be $p/web@sha256:<digest> from publish, got '${WEB_IMAGE:-}'"
    assets_env
    log "web: uploading the static files of $WEB_IMAGE as release $sha"
    registry_login
    "$here/assets.sh" upload "$WEB_IMAGE" "$sha"
    ;;

  push)
    sha_arg "${1:-}"; p="$(prefix)"
    # Every ref must be a digest `publish` handed over for the same image; check all before moving any.
    refs=()
    for t in "${targets[@]}"; do
      var="$(printf '%s' "$t" | tr '[:lower:]' '[:upper:]')_IMAGE"; r="${!var:-}"
      [[ "$r" =~ ^"$p/$t"@sha256:[0-9a-f]{64}$ ]] || die "$var must be $p/$t@sha256:<digest> from publish, got '$r'"
      refs+=("$r")
    done
    registry_login
    for i in "${!targets[@]}"; do
      t="${targets[$i]}"
      log "$t: main -> ${refs[$i]}"
      docker buildx imagetools create --prefer-index=false -t "$p/$t:main" "${refs[$i]}"
    done
    ;;

  deploy)
    sha_arg "${1:-}"; sha="$1"; p="$(prefix)"
    : "${DEPLOY_HOST:?}" "${DEPLOY_USER:?}" "${DEPLOY_SSH_KEY:?}" "${DEPLOY_HOST_KEY:?}"
    assets_env
    dir="${DEPLOY_DIR:-/opt/taha/infra}"
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    umask 077
    printf '%s\n' "$DEPLOY_SSH_KEY" >"$tmp/key"
    printf '%s\n' "$DEPLOY_HOST_KEY" >"$tmp/known_hosts"
    ssh=(ssh -i "$tmp/key" -o IdentitiesOnly=yes -o UserKnownHostsFile="$tmp/known_hosts"
      -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=20 "$DEPLOY_USER@$DEPLOY_HOST")
    # The registry login lasts as long as this job's token: the server pulls with it right now and
    # has no login of its own afterwards (manual roll-forward: DEPLOY_PULL=0, infra/README.md).
    if [ -n "${GHCR_TOKEN:-}" ]; then
      printf '%s' "$GHCR_TOKEN" | "${ssh[@]}" "docker login ghcr.io -u '${GITHUB_ACTOR:-ci}' --password-stdin"
    fi
    # Each release's infra/ folder is kept as releases/<sha>/ (versioned config): deploy.sh copies
    # it to live/ only when it swaps, so a rollback also brings back that release's config.
    release_dir="$dir/releases/$sha"
    log "copying infra/ to $DEPLOY_HOST:$release_dir"
    tar -C "$here" --exclude '*.test.ts' --exclude './*-stub.ts' --exclude './cloudflare' \
      --exclude './media-backup' --exclude './migrate' -cf - . |
      "${ssh[@]}" "mkdir -p '$release_dir' && tar -xf - -C '$release_dir' --no-same-owner"
    log "deploying $sha"
    # A non-zero exit (failed, and already rolled back) fails the job: set -e stops here.
    "${ssh[@]}" "cd '$release_dir' && IMAGE_PREFIX='$p' ./deploy.sh deploy '$sha'"
    # Keep the live and the previous LIVE release, from the server's history: the newest upload
    # may be a release that failed and rolled back.
    keep="$("${ssh[@]}" "cd '$release_dir' && ./deploy.sh live-releases" | paste -sd, -)"
    [[ ",$keep," == *",$sha,"* ]] || die "the server does not report $sha as live (got '$keep'), not pruning"
    log "deploy succeeded, pruning static releases older than 30 days (keeping $keep)"
    "$here/assets.sh" prune --keep "$keep"
    ;;

  *)
    die "usage: ci.sh lint-workflows | build <sha> | smoke <sha> | publish <sha> | gate <upload|deploy> | upload <sha> | push <sha> | deploy <sha>"
    ;;
esac
