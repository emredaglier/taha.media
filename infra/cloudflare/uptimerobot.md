# UptimeRobot monitors

Free plan, 5 minute interval ([ADR-0007](../../docs/adr/0007-observability-free-tier.md)). The owner creates these by hand; nothing in this repo talks to UptimeRobot, so there is no API key to store. Each monitor covers a failure that `/` alone would miss.

| #   | Name              | Type    | URL                                                  | Expect                                  |
| --- | ----------------- | ------- | ---------------------------------------------------- | --------------------------------------- |
| 1   | taha home         | Keyword | `https://taha.media/`                                | HTTP 200, keyword `<home page keyword>` |
| 2   | taha work page    | Keyword | `https://taha.media/<work path>/<slug>`              | HTTP 200, keyword `<Work title>`        |
| 3   | taha static chunk | HTTP(s) | `https://cdn.taha.media/<path to one current chunk>` | HTTP 200                                |

Monitor 1 proves the server renders. Monitor 2 proves a database-backed page renders. Monitor 3 proves the CDN serves a release file.

## Create a monitor (repeat for each row)

1. Sign in at uptimerobot.com (free plan).
2. Click **+ New monitor**.
3. Monitor type: **Keyword** for rows 1 and 2, **HTTP(s)** for row 3.
4. Friendly name: the Name column. URL: the URL column.
5. For keyword monitors, set the keyword and choose "Alert when keyword does not exist". Pick a word that is in the server HTML, not one that a script adds.
6. Monitoring interval: 5 minutes (the free plan's minimum).
7. Alert contacts: tick the owner's email. Add a webhook only if the deploy alerts use one.
8. Click **Create monitor**, then check it turns green within one interval.

## Choosing the Work page (monitor 2)

Pick a published Work that stays published and note its URL and title. If it is renamed or unpublished the monitor goes red: edit the monitor's URL and keyword (Monitors, the monitor, Edit). An old slug redirects, but a redirect does not match the keyword, so update it anyway.

## Choosing the static chunk (monitor 3)

A chunk URL contains the release and content hashes, so it changes with each deploy and the monitor goes red until updated. Find a current one:

```sh
curl -s https://taha.media/ | grep -o 'https://cdn.taha.media/[^"]*\.js' | head -1
```

Paste that URL into monitor 3 after each deploy. If that is too much work, the deploy smoke check (ADR-0010) already covers broken chunks before a release; keep the monitor for the case where the CDN fails later.

## Not monitored here

- `cms` and `/admin` are on Tailscale only (ADR-0001), so UptimeRobot cannot reach them.
- Backups are watched by their own jobs, not by uptime checks.
