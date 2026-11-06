#!/usr/bin/env bash
# Release assets on R2 behind cdn.taha.media (ADR-0005, #17). CI runs it; it never needs the server.
#
#   infra/assets.sh build-args <release>           the docker build args of a release: assetPrefix
#                                                  on the CDN and the deploymentId
#   infra/assets.sh upload <web-image> <release>   copy /_next/static out of the image and upload
#                                                  it to releases/<release>/_next/static/
#   infra/assets.sh prune --keep <live>[,<previous live>] [--dry-run] [--max-age-days N]
#                                                  delete releases older than 30 days except the
#                                                  kept ones (from `deploy.sh live-releases`)
#
# Upload runs BEFORE the deploy, so the files are on the CDN before any HTML references them. It
# never deletes; prune is separate and runs only after a healthy deploy.
# Env: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (upload, prune);
# CDN_ORIGIN (build-args, default https://cdn.taha.media); IMAGE_PLATFORM (default linux/arm64,
# the platform of the images, ADR-0010); STATIC_DIR_IN_IMAGE (default /app/apps/web/.next/static).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cli=(node "$here/release-assets.ts")
static_in_image="${STATIC_DIR_IN_IMAGE:-/app/apps/web/.next/static}"

die() { echo "assets.sh: $*" >&2; exit 1; }

case "${1:-}" in
  build-args)
    release="${2:-}"
    [ -n "$release" ] || die "usage: assets.sh build-args <release>"
    echo "--build-arg ASSET_PREFIX=${CDN_ORIGIN:-https://cdn.taha.media}/releases/$release --build-arg DEPLOYMENT_ID=$release"
    ;;
  upload)
    image="${2:-}" release="${3:-}"
    [ -n "$image" ] && [ -n "$release" ] || die "usage: assets.sh upload <web-image> <release>"
    tmp="$(mktemp -d)"
    ctr=""
    cleanup() { [ -z "$ctr" ] || docker rm -f "$ctr" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
    trap cleanup EXIT
    # The image is arm64; the upload job may run on x86. `create` never starts it, so that works.
    ctr="$(docker create --platform "${IMAGE_PLATFORM:-linux/arm64}" "$image")"
    docker cp "$ctr:$static_in_image/." "$tmp/static" || die "no $static_in_image in $image"
    "${cli[@]}" upload --dir "$tmp/static" --release "$release"
    ;;
  prune)
    shift
    exec "${cli[@]}" prune "$@"
    ;;
  *)
    die "usage: assets.sh build-args <release> | upload <web-image> <release> | prune --keep A[,B] [...]"
    ;;
esac
