---
type: index
title: wiki-renderer (local) code wiki
updated: 2026-10-08
tags:
  - code-wiki
---

# wiki-renderer (local): code wiki

Implementation-level notes and delivery records for this repo. Product decisions and architecture live in the
`project-management` vault (`wiki/decisions/`, `wiki/deliverables/architecture/`).

- `contracts/`: per-story verification contracts
- `reviews/`: review records
- `verification/`: verification records
- `census/`: scope census records
- `measurements/`: measurement notes

## Origin

Scaffolded on 2026-10-08 from a private multi-tenant renderer's web app. The render core (`content/render`,
`content/links`, `content/search`), the reader UI and the design-system install came over as they were. Removed: Auth.js and
sign-in, tenancy, projects and access, the admin console, MongoDB, the GitHub App source and its freshness/revocation
runtime, the memory-budget LRU, Cloud Build and Docker. Added: `content/runtime/{config,local-source,source}.ts` and a
simpler `getSnapshot` (fingerprint, rebuild on change, keep serving the last good snapshot on a read error).
Checks at scaffold: typecheck 0 errors, lint clean, unit 115 files / 1733 tests, e2e smoke 4/4, `next build` clean.
The `project-management` vault renders: 713 pages, about 9 s for the first build.
