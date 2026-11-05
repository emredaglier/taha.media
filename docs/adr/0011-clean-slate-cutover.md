# 11. Clean-slate cutover; content is re-uploaded, not migrated

Date: 2026-11-05 · Status: accepted (adapted from daglier.com ADR-0010)

An earlier attempt is live at taha.media today. Its content is not migrated: Taha re-uploads his Works from his own files into the new `cms`. At cutover, the old server is backed up and wiped (ADR-0009), and the old site's data is not carried over. **Any wipe of a production database or R2 bucket is confirmed with the owner right before it runs**, because it can't be undone.
