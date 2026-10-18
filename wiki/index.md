---
type: index
title: wiki-renderer (local) code wiki
updated: 2026-10-17
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

## Page editing (2026-10-16)

Edit on every page, block-preserving saves, image uploads to `assets/`; AGENTS.md "Editing". Record:
[[page-editing-2026-10-16]] (`verification/`, PASS). Branch `feat/page-editing` (`b504b6f`, `302fc23`).

## Page width with A4 guides (2026-10-17, US-280)

A drag handle (ESG Design System `WidthHandle`, v54) on the article's edge with Reading, A4 portrait, A4 landscape and Full guides, kept per browser in the `wr-page-width` cookie. At the A4 guides the article uses the print type scale. Print sets one `@page` margin of 10 mm and **no `size`**, which would hide the print dialog's orientation control. Commit `4df6078`. Records: [[US-280-page-width-contract]] (`contracts/`), [[page-width-review-2026-10-17]] (`reviews/`, r1–r3 APPROVED), [[page-width-2026-10-17]] (`verification/`, PASS; screenshots in `verification/screenshots/page-width-2026-10-17/`).
