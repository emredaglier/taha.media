# 2. Payload localization switched on with a single locale (tr)

Date: 2026-11-05 · Status: accepted

The site is Turkish-only for now, but English may come later. Payload's localization is enabled with `tr` as the only locale, and text fields are marked localized. Content looks the same today. Adding English later becomes a config change plus translation work, with no migration of every text field. The cost is a few extra locale tables in SQLite. Switching localization off would have been simpler, but would turn "add English" into a data migration.
