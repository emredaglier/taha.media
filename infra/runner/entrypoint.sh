#!/usr/bin/env bash
# Runs inside the runner container: empty the work folder, register as one ephemeral runner, take
# one job, exit. The registration token arrives in REG_TOKEN (infra/runner/runner.sh fetches it for
# each run).
# Variables: REG_TOKEN, REPO_URL, RUNNER_NAME, RUNNER_LABELS, RUNNER_WORKDIR, TMPDIR. RUNNER_DIR
# (default /opt/runner, where the Dockerfile installs the runner) and DOCKER_SOCKET (default
# /var/run/docker.sock) exist for infra/runner/runner.test.ts.
set -euo pipefail

die() { echo "entrypoint.sh: $*" >&2; exit 1; }

: "${REG_TOKEN:?}" "${REPO_URL:?}" "${RUNNER_NAME:?}" "${RUNNER_LABELS:?}" "${RUNNER_WORKDIR:?}" "${TMPDIR:?}"
runner_dir="${RUNNER_DIR:-/opt/runner}"
sock="${DOCKER_SOCKET:-/var/run/docker.sock}"

# The cleanup below deletes as root: RUNNER_WORKDIR must not be /, and TMPDIR must sit inside it.
[[ "$RUNNER_WORKDIR" =~ ^/*$ ]] && die "RUNNER_WORKDIR must not be / ($RUNNER_WORKDIR)"
case "$TMPDIR" in
  */..|*/../*) die "TMPDIR must not contain .. ($TMPDIR)" ;;
  "${RUNNER_WORKDIR%/}"/?*) ;;
  *) die "TMPDIR must be inside RUNNER_WORKDIR ($TMPDIR, $RUNNER_WORKDIR)" ;;
esac

# Why this runs here and not on the Mac: infra/README.md, "A clean work folder per job" (#87).
# sudo: job containers can leave root-owned files. A file that won't go (a cancelled job's
# containers still writing) is reported, not fatal, or the runner would never register again.
mkdir -p "$RUNNER_WORKDIR/_work" "$TMPDIR"
sudo find "$RUNNER_WORKDIR/_work" -mindepth 1 -maxdepth 1 ! -name _tool -exec rm -rf {} + \
  || echo "entrypoint.sh: could not fully empty $RUNNER_WORKDIR/_work, continuing" >&2
sudo find "$TMPDIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} + \
  || echo "entrypoint.sh: could not fully empty $TMPDIR, continuing" >&2

# The host's Docker socket belongs to a group id the image does not know. Give `runner` that
# group, or job steps could not reach the daemon.
gid=0
if [ -S "$sock" ]; then
  gid="$(stat -c %g "$sock")"
  if [ "$gid" = 0 ]; then
    sudo chmod 666 "$sock"
  else
    getent group "$gid" >/dev/null || sudo groupadd -g "$gid" dockersock
    sudo usermod -aG "$gid" runner
  fi
fi

cd "$runner_dir"
./config.sh --unattended --ephemeral --replace \
  --url "$REPO_URL" --token "$REG_TOKEN" \
  --name "$RUNNER_NAME" --labels "$RUNNER_LABELS" --no-default-labels \
  --work "$RUNNER_WORKDIR/_work"
unset REG_TOKEN

# `sg` starts the runner with the socket's group (usermod only affects new logins).
if [ "$gid" != 0 ]; then exec sg "$gid" -c ./run.sh; fi
exec ./run.sh
