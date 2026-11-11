#!/usr/bin/env bash
# The self-hosted CI runner on the owner's Mac (#84). Runbook: infra/README.md, "Self-hosted
# fallback". Needs Docker Desktop and `gh` logged in with admin rights on the repo.
#
#   infra/runner/runner.sh build    build the arm64 runner image
#   infra/runner/runner.sh start    start the runner loop in the background (one job at a time)
#   infra/runner/runner.sh run      the same loop in the foreground (Ctrl-C stops it)
#   infra/runner/runner.sh stop     stop the loop and the runner container
#   infra/runner/runner.sh status   is it running, and what GitHub says about the runner
#
# Each loop turn fetches a fresh registration token (nothing is stored), starts ONE container that
# registers --ephemeral, runs one job and exits, then the next turn starts. So there is never more
# than one runner, and never two builds at once (CLAUDE.md: parallel Next builds crash this Mac).
#
# This side never deletes in _work or tmp: infra/README.md, "A clean work folder per job" (#87).
#
# The work directory is mounted at the SAME absolute path inside and outside the container, and
# TMPDIR points into it. Job steps talk to the host's Docker daemon through its socket, so every
# `docker run -v <path>` (smoke/run.ts, Compose) is resolved by the daemon on the host side: only a
# path that exists there too gives the containers the files. It must be under /Users for Docker
# Desktop's file sharing. The container uses host networking so the 127.0.0.1:<port> that smoke
# publishes is reachable from the runner (and from Chromium in it).
#
# Variables: CI_RUNNER_HOME (default ~/.taha-ci-runner), CI_RUNNER_REPO (default
# emredaglier/taha.media), CI_RUNNER_LABEL (default taha-mac-arm64), CI_RUNNER_IMAGE.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="${CI_RUNNER_REPO:-emredaglier/taha.media}"
label="${CI_RUNNER_LABEL:-taha-mac-arm64}"
image="${CI_RUNNER_IMAGE:-taha-ci-runner:local}"
home="${CI_RUNNER_HOME:-$HOME/.taha-ci-runner}"
container=taha-ci-runner
pidfile="$home/loop.pid"

die() { echo "runner.sh: $*" >&2; exit 1; }

cmd="${1:-}"

loop() {
  mkdir -p "$home"
  trap 'docker rm -f "$container" >/dev/null 2>&1 || true; exit 0' INT TERM
  while true; do
    token="$(gh api --method POST "repos/$repo/actions/runners/registration-token" --jq .token)" \
      || { echo "runner.sh: could not fetch a registration token, retrying in 60 s" >&2; sleep 60; continue; }
    docker rm -f "$container" >/dev/null 2>&1 || true
    # REG_TOKEN is passed by name, so it is not on the command line.
    REG_TOKEN="$token" docker run --rm --name "$container" --network host \
      --env REG_TOKEN --env "REPO_URL=https://github.com/$repo" \
      --env "RUNNER_NAME=taha-mac" --env "RUNNER_LABELS=$label" \
      --env "RUNNER_WORKDIR=$home" --env "TMPDIR=$home/tmp" \
      --volume "$home:$home" --volume /var/run/docker.sock:/var/run/docker.sock \
      --device /dev/net/tun --cap-add NET_ADMIN \
      "$image" || echo "runner.sh: the runner container exited with $?, restarting in 10 s" >&2
    sleep 10
  done
}

case "$cmd" in
  build)
    docker build --platform linux/arm64 -t "$image" "$here"
    ;;
  start)
    mkdir -p "$home"
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then die "already running (pid $(cat "$pidfile"))"; fi
    nohup "$0" run >"$home/runner.log" 2>&1 &
    echo $! >"$pidfile"
    echo "started (pid $!), log: $home/runner.log"
    ;;
  run)
    loop
    ;;
  stop)
    if [ -f "$pidfile" ]; then kill "$(cat "$pidfile")" 2>/dev/null || true; rm -f "$pidfile"; fi
    docker rm -f "$container" >/dev/null 2>&1 || true
    echo stopped
    ;;
  status)
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then echo "loop running (pid $(cat "$pidfile"))"; else echo "loop not running"; fi
    docker ps --filter "name=$container" --format 'container: {{.Names}} {{.Status}}'
    gh api "repos/$repo/actions/runners" --jq '.runners[] | "github: \(.name) \(.status) busy=\(.busy)"'
    ;;
  *)
    die "usage: runner.sh build | start | run | stop | status"
    ;;
esac
