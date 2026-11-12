# 13. The admin sends no email; passwords are reset from the server

Date: 2026-11-05 · Status: accepted

`cms` has no email transport, so Payload's "forgot password" is disabled. An Editor's password is reset with a one-line command run over Tailscale/SSH in the `migrate` image (`reset-password.ts`, runbook in `infra/README.md`, "Deploy"; locally `pnpm user:reset-password`). At launch there are two Editors: the developer and Taha. Both reach the server through the developer, and an email provider would be one more third party, secret and privacy-notice entry for something that happens rarely.
