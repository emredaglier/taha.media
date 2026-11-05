# 10. CI-built arm64 images, health-gated deploy with automatic rollback

Date: 2026-11-05 · Status: accepted (adapted from daglier.com ADR-0005)

GitHub Actions runs lint, typecheck and Vitest, then builds the `web` and `cms` images natively on the `ubuntu-24.04-arm` runner. That runner works in private repos and counts against the plan's free minutes. QEMU emulation on an x86 runner was rejected because it makes Next.js builds several times slower, and building on the server is ruled out (ADR-0009). CI runs a Playwright smoke test of every route against the built image, pushes the images to GHCR, joins the tailnet and runs `infra/deploy.sh`. The deploy pulls the images, runs migrations (ADR-0003), swaps the containers and smoke-checks home, one Work page, one static chunk and one R2 file. If a check fails, it rolls back to the previous tag and sends an alert. There is no permanent staging environment.
