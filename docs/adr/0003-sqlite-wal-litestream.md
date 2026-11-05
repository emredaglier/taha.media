# 3. SQLite (WAL) with Litestream backups

Date: 2026-11-05 · Status: accepted (copied from daglier.com ADR-0003)

A portfolio has one writer and light traffic, and Postgres would be one more service to run. SQLite runs in WAL mode with `busy_timeout` set. `cms` writes, and `web` and `web-preview` open the database read-only. Litestream streams continuous backups to a private R2 bucket. Migrations run in a one-off container before a new release starts, and they are additive (expand and contract), so the previous release keeps working if a rollback happens. Backups and restores are a single file, and every process must run on one host.
