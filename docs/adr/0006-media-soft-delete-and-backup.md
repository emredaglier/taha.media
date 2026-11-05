# 6. Media soft delete and nightly backup

Date: 2026-11-05 · Status: accepted (copied from daglier.com ADR-0009; mechanism changed 2026-11-06)

R2 has no versioning, so a delete in the admin would destroy the file for good. Deleting an image or video in `cms` removes the record and moves the R2 objects (original and every size) to `trash/<key>`. A lifecycle rule on the `trash/` prefix removes them 30 days later. A nightly job copies new objects into a separate backup bucket and never deletes anything there; it skips `trash/` and `_next/`. Videos make this library grow faster than daglier.com's, so the 10 GB R2 free tier is watched, and the upload caps on video size exist partly for this reason.

Why a move and not a tag: R2 has no object tagging, and its lifecycle rules match by key prefix only. A tag-based design would never clean up, so a prefix is the only thing a rule can expire.
