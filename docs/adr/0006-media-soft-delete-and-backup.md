# 6. Media soft delete and nightly backup

Date: 2026-11-05 · Status: accepted (copied from daglier.com ADR-0009)

R2 has no versioning, so a delete in the admin would destroy the file for good. Deleting an image or video in `cms` removes the record and tags the R2 object for cleanup after 30 days. A nightly job copies new objects into a separate backup bucket and never deletes anything there. Videos make this library grow faster than daglier.com's, so the 10 GB R2 free tier is watched, and the upload caps on video size exist partly for this reason.
