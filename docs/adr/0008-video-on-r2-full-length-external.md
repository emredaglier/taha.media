# 8. Short video as MP4 on R2; full-length video on Vimeo or YouTube; no transcoding

Date: 2026-11-05 · Status: accepted

The Showreel loop, Work preview loops and short Work videos are web-ready MP4 (H.264) files that Taha exports himself and uploads through `cms` to R2. The site plays them in a native `<video>` element. Full-length pieces are not hosted: a Work stores the external Vimeo or YouTube link (provider and video id), shown as a click-to-load player with a poster from our own media (frontend ADR-0102). Nothing is transcoded, and there is no HLS. The VPS is too small to transcode, and clips this short don't need adaptive streaming.

Images and videos are separate upload collections. A video requires a poster image, and its width, height, duration, codec and audio track are read from the MP4 header in JavaScript at upload, with no ffmpeg in the image. Uploads over these caps are refused with a Turkish message:

| Use | Max length | Max resolution | Audio | Max size |
|---|---|---|---|---|
| Preview loop | 10 s | 720p | none | 4 MB |
| Showreel loop (optional smaller phone version) | 30 s | 1080p | none | 15 MB |
| Work main video | 3 min | 1080p | allowed | 60 MB |

## Consequences

Anything longer than three minutes goes to Vimeo or YouTube. The caps also keep the library inside R2's 10 GB free tier (ADR-0006).
