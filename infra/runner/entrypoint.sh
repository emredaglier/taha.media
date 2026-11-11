#!/usr/bin/env bash
# Runs inside the runner container: empty the work folder, register as one ephemeral runner, take
# one job, exit. The registration token arrives in REG_TOKEN (infra/runner/runner.sh fetches it for
# each run).
# Variables: REG_TOKEN, REPO_URL, RUNNER_NAME, RUNNER_LABELS, RUNNER_WORKDIR, TMPDIR. RUNNER_DIR
# (default /opt/runner, where the Dockerfile installs the runner) and DOCKER_SOCKET (default
# /var/run/docker.sock) exist for infra/runner/runner.test.ts.
set -euo pipefail

: "${REG_TOKEN:?}" "${REPO_URL:?}" "${RUNNER_NAME:?}" "${RUNNER_LABELS:?}" "${RUNNER_WORKDIR:?}" "${TMPDIR:?}"
runner_dir="${RUNNER_DIR:-/opt/runner}"
sock="${DOCKER_SOCKET:-/var/run/docker.sock}"

# Every job starts from an empty work folder and TMPDIR; only the tool cache (_tool) stays. They are
# emptied here, inside Docker Desktop's VM, never from the Mac (#87): the VM caches what it has seen
# of the shared folder, a folder the Mac deletes can still look present in here, and the job then
# fails in Set up job with "Could not find file '.../_work/_PipelineMapping/<owner>'". sudo: job
# steps' own containers (smoke, Compose) can leave root-owned files.
mkdir -p "$RUNNER_WORKDIR/_work" "$TMPDIR"
sudo find "$RUNNER_WORKDIR/_work" -mindepth 1 -maxdepth 1 ! -name _tool -exec rm -rf {} +
sudo find "$TMPDIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

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
