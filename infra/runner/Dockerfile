# Self-hosted CI runner (#84): GitHub's official runner in Ubuntu 24.04 arm64, for the owner's Mac
# (Docker Desktop). Runbook: infra/README.md, "Self-hosted fallback". Built by infra/runner/runner.sh.
# The job steps need what GitHub's own image has: git, curl, sudo (Playwright's `--with-deps`),
# zstd (actions/cache), ssh (deploy), and the Docker CLI with buildx and compose (the host's daemon
# is reached through its socket, there is no daemon in here).
FROM ubuntu:24.04

ARG RUNNER_VERSION=2.338.2
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git gnupg jq sudo tar unzip zstd xz-utils openssh-client bsdutils \
      build-essential python3 \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" \
         > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
      docker-ce-cli docker-buildx-plugin docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# The runner refuses to run as root, so jobs run as `runner` with passwordless sudo (as on
# GitHub's VMs). entrypoint.sh gives it the group of the host's Docker socket.
RUN useradd --create-home --shell /bin/bash --uid 1001 runner \
    && echo 'runner ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/runner

WORKDIR /opt/runner
RUN curl -fsSL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" \
      | tar -xz \
    && ./bin/installdependencies.sh \
    && rm -rf /var/lib/apt/lists/* \
    && chown -R runner:runner /opt/runner

COPY entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh

USER runner
ENTRYPOINT ["/opt/entrypoint.sh"]
