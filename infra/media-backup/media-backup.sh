#!/usr/bin/env bash
# Nightly copy of new media objects from the media bucket to the backup bucket (ADR-0006).
#
# It only ever COPIES. Nothing here syncs, moves or deletes, and infra/media-backup/
# media-backup.test.ts fails if a delete-like command or flag appears. A key already in the backup
# is never rewritten (objects are immutable, ADR-0005), and an object removed from the media
# bucket after its 30 days stays in the backup.
#
# Remotes come from rclone's own config variables, set by the caller (the workflow):
#   RCLONE_CONFIG_SRC_*  the media bucket (read key)
#   RCLONE_CONFIG_DST_*  the backup bucket (write key, no delete permission in practice)
# Our own settings are NOT named RCLONE_*: rclone reads every RCLONE_* variable as a flag
# (RCLONE_VERSION became --version; self-hosted-deploy lesson).
#
# Needs SRC_BUCKET and DST_BUCKET. Optional: WORK_DIR for scratch files.
set -euo pipefail

: "${SRC_BUCKET:?set SRC_BUCKET (media bucket)}"
: "${DST_BUCKET:?set DST_BUCKET (backup bucket)}"
work="${WORK_DIR:-$(mktemp -d)}"

# One list for the listing and the copy, so they cannot drift. Static assets are not media.
skip=(--exclude '_next/**')

# What is in the media bucket now. The check below asks for exactly these names, so an upload
# during the run cannot fail it (rclone check with --min-age would hide fresh copies).
rclone lsf -R --files-only "${skip[@]}" "SRC:${SRC_BUCKET}" > "${work}/listed.txt"

# --ignore-existing: only new keys are transferred; existing backup objects are never touched.
rclone copy "SRC:${SRC_BUCKET}" "DST:${DST_BUCKET}" "${skip[@]}" \
  --ignore-existing --s3-no-check-bucket --transfers 8 --stats-one-line -v

# Every listed object must now be in the backup, at the same size. Read-only.
rclone check "SRC:${SRC_BUCKET}" "DST:${DST_BUCKET}" --one-way --size-only \
  --files-from "${work}/listed.txt"
