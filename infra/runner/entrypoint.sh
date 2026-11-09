#!/usr/bin/env bash
# Runs inside the runner container: register as one ephemeral runner, take one job, exit. The
# registration token arrives in REG_TOKEN (infra/runner/runner.sh fetches it for each run).
# Variables: REG_TOKEN, REPO_URL, RUNNER_NAME, RUNNER_LABELS, RUNNER_WORKDIR, TMPDIR.
set -euo pipefail

: "${REG_TOKEN:?}" "${REPO_URL:?}" "${RUNNER_NAME:?}" "${RUNNER_LABELS:?}" "${RUNNER_WORKDIR:?}" "${TMPDIR:?}"

# The host's Docker socket belongs to a group id the image does not know. Give `runner` that
# group, or job steps could not reach the daemon.
sock=/var/run/docker.sock
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

cd /opt/runner
mkdir -p "$RUNNER_WORKDIR/_work" "$TMPDIR"
./config.sh --unattended --ephemeral --replace \
  --url "$REPO_URL" --token "$REG_TOKEN" \
  --name "$RUNNER_NAME" --labels "$RUNNER_LABELS" --no-default-labels \
  --work "$RUNNER_WORKDIR/_work"
unset REG_TOKEN

# `sg` starts the runner with the socket's group (usermod only affects new logins).
if [ "$gid" != 0 ]; then exec sg "$gid" -c ./run.sh; fi
exec ./run.sh
