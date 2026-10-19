<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# wiki-renderer (local)

A **local** renderer and editor for Obsidian-flavoured Markdown wikis that sit in folders on this machine. It's one
Next.js (App Router) app on Node 24, with no sign-in, no tenants, no database and no GitHub. Each wiki is a folder named
in `WIKI_DIRS`. The reader comes from a private multi-tenant renderer: this repo was scaffolded from it on 2026-10-08, with tenancy,
auth, admin, MongoDB and the GitHub App removed and a filesystem source added. Its first consumer is the `project-management` vault, which reads its own `wiki/` through it.

## Running it

```bash
npm install
npm run dev                              # http://127.0.0.1:3000; the wiki list comes from the config file
cp .env.local.example .env.local         # developer path: set WIKI_DIRS (it overrides the file)
WIKI_DIRS="notes=~/notes/wiki" npm run dev   # or inline
```

The wiki list lives in `config.json` in the user's config folder (macOS `~/Library/Application Support/wiki-renderer`,
Linux `$XDG_CONFIG_HOME/wiki-renderer` else `~/.config/wiki-renderer`, Windows `%APPDATA%\wiki-renderer`);
`WIKI_RENDERER_CONFIG` names another file. Shape: `{"wikis": [{"id", "name", "root"}], "printFileTitle": false, "port": 4700}` (`port` optional), nothing
else (branding stays build-time env). The file is re-read when its mtime changes (checked at most once per
`WIKI_RECHECK_MS`), so a change shows without a restart; a removed wiki's caches are dropped. A relative `root` in the file resolves against the config file's folder (`WIKI_DIRS` entries resolve against the repo's working directory). Deleting the file empties the list. A missing file starts the
server with an empty home page naming the path; a bad file keeps the last good list and the home page names the problem.
`src/content/runtime/user-config.ts` is the one reader and atomic writer (`writeUserConfig`); `getWikiList()` in
`runtime/index.ts` returns `{ wikis, source: "env" | "file", managedByEnv, configPath, error? }`.
**Settings** (`/settings`, in the settings menu) is how an installed app adds, renames, reorders and removes wikis and sets the print switch (file-name heading and page details); editing the config file by hand is still fine in dev.

`WIKI_DIRS` is the override: when set, the file's wikis are ignored (`managedByEnv`) and a bad value exits at startup.
It holds comma-separated `id=folder` pairs, or bare folders. A bare folder takes its id from the folder's name,
or from its parent's name when the folder is called `wiki`; `~/` resolves from `os.homedir()` (Windows too). With one wiki, `/` redirects straight to it. With several,
`/` lists them. `WIKI_PRINT_FILE_TITLE`, when set, wins over the file's `printFileTitle`. Edits in the vault
show on the next request after `WIKI_RECHECK_MS` (default 1 s): the folder is
fingerprinted by path, size and mtime, and a changed fingerprint rebuilds the snapshot. The server binds to
`127.0.0.1` because nothing is access-controlled.

## Editing

Every page has **Edit** (`?view=edit`): the ESG Design System's RichTextEditor (MDXEditor; ESG toolbar and dialogs since v49) on the
page's Markdown, with a Rich text / Source / Changes switch. **Save** (or ⌘S / Ctrl S) writes the file in the wiki folder; you commit and push with git.

- **Untouched text stays byte-identical.** The save sends the editor's Markdown before any edit and now; `content/edit/merge.ts`
  maps both back onto the file, so only the blocks, lines and characters you changed are rewritten. HTML comments, which the
  editor drops, are kept. Gate (2026-10-16, the project-management vault): 835/835 pages unchanged on a no-edit save, 648/648
  edits kept to their block, 643/648 mid-line edits byte-exact (the rest: lines whose code-span URLs the editor rewrites).
- **Obsidian syntax:** wikilinks, embeds and `> [!callout]` show as text in the editor and are written back unescaped.
- **A page the editor can't parse** (MDX-like `<screen>` text) opens as plain source in a text area and saves the same way.
- **Conflicts:** if the file changed on disk after you opened it (Obsidian, `git pull`), nothing is saved; reload and redo.
- **Images:** the image dialog uploads a picked file into `assets/` at the wiki root (operator, 2026-10-16: "One assets/ folder";
  safe file name, never over an existing file, 10 MB, PNG/JPG/GIF/WebP/SVG) and writes a Markdown image relative to the page
  (`![Alt](../assets/name.png)`). The editor previews wiki images through `/api/wikis/<id>/latest-asset/<path>`, a redirect to the
  asset route at the current snapshot sha.
- `WIKI_READ_ONLY=true` hides Edit and refuses saves and uploads.

## Branding

The default brand is **Wiki Renderer** / **Wikis**, a TenantLogo showing the **WR** mark (US-289, operator variant C: white Figtree 800 on the
ESG background, radius 12), and tab titles ending "· Wiki Renderer". The mark is `public/wr-mark.svg`, passed as the TenantLogo's `src`
by `branding().logo` only while nothing is branded (no `BRAND_LOGO`, no `BRAND_INITIALS`, the default `BRAND_NAME`); `BRAND_INITIALS` gives the
initials on the `BRAND_TONE` ground (design system v31, never the brand gradient) and `BRAND_LOGO` its image, as before. The same mark is the tab icon through
Next's file conventions (`src/app/icon.svg`, `icon.png` 32 px, `apple-icon.png` 180 px, `favicon.ico` 16 and 32 px) and is not changed by `BRAND_*`.
All five are generated and committed by `scripts/make-mark.mjs` (the ESG ground from the design system's `esg-background.svg`, outlines by
`fontkit` + `wawoff2`, rasters by Playwright's Chromium; dev-only, never run at build, so no native module reaches the archive); don't edit them by hand.
`src/app/icon.svg` carries the ground's colours, so the colour guard skips that one file; `scripts/make-mark.test.ts` pins it to `public/wr-mark.svg`.
The mark is served from the app's own origin, so the CSP is unchanged (`img-src 'self'`). There is no other ESG logo in the repo. A deployment brands itself with `BRAND_NAME`, `BRAND_PRODUCT`, `BRAND_INITIALS` (one or
two letters), `BRAND_TONE` (`indigo`, `deep` or `glow`), `BRAND_LOGO` (an image file, served at `/api/brand/logo`) and
`BRAND_TITLE` (see `.env.local.example`). For example, a firm's own branding:

```bash
BRAND_NAME="The Firm" BRAND_TITLE="The Firm Wikis" \
BRAND_LOGO=/path/to/logo.png npm run dev
```

`src/lib/branding.ts` reads the env, and `src/i18n/request.ts` merges it into the `brand.*`, `readerShell.brandProduct`
and `documentTitle.suffix` messages. Screens never read the env themselves: each builds the registry `Brand`'s props
through `src/components/brand-props.tsx`, which always passes a TenantLogo as its `mark`, so the registry's ESG PNG
default is never shown. `tools/registry-add.sh ... brand` copies `public/esg-logo-mark.png`: delete it again.

## Folder map

| Path | What |
|---|---|
| `src/content/runtime/` | `config.ts` (parses `WIKI_DIRS`, the id rule, `~`), `user-config.ts` (the config file: path, reader, atomic writer), `local-source.ts` (folder → files + fingerprint sha), `local-write.ts` (the only writer: saves one existing `.md` page, adds an image to `assets/`), `build.ts` (one parse → snapshot), `index.ts` (`getSnapshot`, `getWikiList`, `listWikis`, `findWiki`, `printFileTitle`), `cache.ts`, `tree.ts` |
| `src/content/edit/` | `merge.ts`: the save's block-preserving merge (untouched blocks, lines and characters keep their original bytes; HTML comments kept; Obsidian syntax unescaped) |
| `src/content/render/` | Markdown → React pipeline: wikilinks, embeds, callouts, Mermaid placeholders, Shiki, sanitiser, render cache |
| `src/content/links/` | link map and resolution, asset URLs, path confinement |
| `src/content/search/` | MiniSearch index built at snapshot time; client-side query |
| `src/app/w/[wikiId]/[[...path]]/` | the reader page (landing, page, `?view=source`, `?view=edit`) and `actions.ts` (`savePageAction`, `uploadImageAction`) |
| `src/app/api/wikis/[wikiId]/{asset,source,search-index}/` | the snapshot's files, by sha; `latest-asset/` redirects the editor's image previews to the current sha |
| `src/app/settings/`, `src/components/settings/` | the Settings page (`/settings`): `page.tsx`, `actions.ts` (`changeSettingsAction`, the one server action), `failure-copy.ts`; client table, dialogs and print switch |
| `src/content/runtime/wiki-list-edit.ts` | `applyChange`: Host check, `WIKI_DIRS` refusal, zod validation, add-path checks (`checkNewFolder`, size capped by `measureFolder`), re-read, `writeUserConfig`. `src/lib/host-check.ts` is the Host check |
| `src/app/page.tsx` | the wiki list, or a redirect when only one wiki is configured |
| `src/components/reader/` | reader UI (shell, sidebar, nav tree, outline, search dialog, PDF, source view, editor: `edit-view.tsx`, `edit-editor.tsx`) |
| `src/components/ui/`, `src/components/layout/`, `src/app/esg-theme.css`, `src/fonts/` | **installed** from the ESG design-system registry; don't hand-edit. Installed at design system **v57** (`esg-design-system` `703970a`, published 2026-10-17 as artifact version 125, pulled from the local registry 2026-10-17: every item re-pulled with `--overwrite` at v56 (US-288), then `width-handle` and `theme` at v57 (US-281), no forks of design components, operator ruling 2026-10-17). Restore `package.json` and `package-lock.json` after `registry-add.sh` (the CLI loosens exact pins) |
| `src/cli/` | the `wiki-renderer` command (US-278): `args.ts` (parser), `commands.ts` (`add` / `remove` / `list` through `checkNewFolder` + `writeUserConfig`), `start.ts` (port probe, spawns `server.js` with `HOSTNAME=127.0.0.1`, opens the browser), `open-browser.ts`, `port.ts`, `update-check.ts` (the opt-in update notice, US-279), `help.ts`, `copy.ts`, `main.ts`. `vite.cli.config.mts` bundles it to `build-cli/cli.mjs`. `src/lib/version.ts` reads `package.json`'s version for `--version` and the Settings footer |
| `scripts/` | the packaging (US-278): `package.mjs` (stage + pack one archive), `lib/archive.mjs` (tar.gz and zip writers), `lib/node-dist.mjs` + `ci-tools.mjs` (fetch and verify Node, unpack), `smoke.mjs` (runs an unpacked archive), `launcher/` (`wiki-renderer`, `wiki-renderer.cmd`). `.github/workflows/release.yml` runs them on a `v*.*.*` tag. US-279: `install-check.mjs` (the workflow's installer step) and `lib/release-server.mjs` (a local stand-in for GitHub's release downloads and `releases/latest`, ports 3320-3329), `install.test.ts` and `install-ps1.test.ts` |
| `install.sh`, `install.ps1` | the one-line installers (US-279), served from `raw.githubusercontent.com/.../main/`. POSIX `sh` and Windows PowerShell 5.1, ASCII only. Seams: `WIKI_RENDERER_HOME`, `WIKI_RENDERER_VERSION`, `WIKI_RENDERER_DOWNLOAD_BASE`, `WIKI_RENDERER_API_BASE` |
| `tests/e2e/`, `tests/fixtures/` | Playwright smoke suite and its two sample wikis |

## Conventions

- `content/*` never imports `app/*` or `components/*`, except for the handful of request helpers that already did so in
  the service. Routes call `getSnapshot` and then render.
- `content/runtime/local-source.ts` is the only module that reads wiki content from the filesystem, and `content/runtime/local-write.ts` the only one that writes it.
- Folder skipping matches what a GitHub tarball would carry. Only `.git`, `node_modules`, `.obsidian`, `.trash` and
  `.DS_Store` are skipped. Every other folder is content, dot folders included (DEC-006 in the vault: nothing is
  hidden by name).
- Keep render behaviour identical to the service. A rendering fix belongs in **both** repos until the render core is
  extracted into a shared package (an open question; see the vault's note on this repo).

## Commands

| Command | What |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next on 127.0.0.1 |
| `npm run typecheck` | TypeScript 7 (`tsc --noEmit` via `node_modules/typescript/bin/tsc`) |
| `npm run lint` | ESLint 10 through `scripts/eslint-ts6.cjs` |
| `npm test` | Vitest unit suite (`src/**/*.test.ts`, `scripts/**/*.test.ts`) |
| `npm run test:e2e` | Playwright: starts `next dev` on :3100 against `tests/fixtures/` |
| `npm run build:cli` | Vite SSR bundle of `src/cli/` into `build-cli/cli.mjs` (needs no Next build) |
| `npm run package -- <darwin\|linux\|win> <arm64\|x64> <nodeDir>` | after `npm run build` and `build:cli`: `release/wiki-renderer-<v>-<platform>-<arch>.{tar.gz,zip}` (see Portable build) |
| `npm run smoke -- <unpackedDir> --port 3310` | smoke an unpacked archive (needs `npx playwright install chromium`) |
| `npm run test:e2e:config` | Config-file e2e (US-276): run `npm run build` first; uses `playwright.config-file.config.ts` |

## Portable build and releases (US-278)

`next.config.ts` sets `output: "standalone"` and traces out `sharp` and `@img` (`outputFileTracingExcludes`; `images.unoptimized`
alone does not drop them), so the server has no native module. `npm start` still works but Next warns that `next start`
does not work with standalone; the archive runs `node server.js`. `scripts/package.mjs` copies `.next/standalone`, adds
`.next/static`, `public/`, `cli.mjs`, the launchers and the Node binary (`bin/node`, `bin/node.exe` on Windows), deletes `.env*`, `src/` and `tests/`
(tracing copies them in), turns the symlinks in `.next/node_modules` into folders and fails on any `.node`, `.dll`, `.so`
or `.dylib` file. Shiki's WASM is inlined in JS and is fine.

- **Release:** push a tag `v<x.y.z>`. The workflow sets `package.json`'s version from the tag, builds once on Linux, then packages and smoke-tests (`scripts/smoke.mjs`: version, add/list/remove, busy port, loopback-only listener, `/`, a page, search, Settings footer, a real page save through the editor, zero non-127.0.0.1 requests, a clean stop) on the five native runners, and publishes with `SHA256SUMS` only if all five pass. The Node version is `NODE_VERSION` in the workflow, verified against nodejs.org's `SHASUMS256.txt`.
- **Port:** default 4700 with the next free one up to 4709 (`src/cli/port-plan.ts`); `--port` > `WIKI_RENDERER_PORT` > config `port` (1024-65535, `user-config.ts`, set on Settings > Server through `changeSettingsAction`'s `port` change, open even when `WIKI_DIRS` manages the list) are fixed and never move. The probe (`port.ts`) binds 127.0.0.1 and connects to 127.0.0.1 and ::1; it never binds a wildcard (firewall prompts). `scripts/node-sha256.json` holds the expected Node hashes; bump it with `NODE_VERSION`.
- **Launcher:** `wiki-renderer` / `wiki-renderer.cmd` run `bin/node cli.mjs`. `start` sets `HOSTNAME=127.0.0.1` and `PORT` for the server (Next defaults to 0.0.0.0; Settings' Host check reads `PORT`). `server.js` changes into the install folder, so a relative `WIKI_DIRS` entry resolves there.
- **Local run:** see the scripts' headers. Build in a copy of the repo if a `next dev` is running (it holds the `.next` lock).

## Toolchain and versions

- Dependencies are **latest stable, exact-pinned**: no `^` or `~` ranges.
- **Node 24**, **TypeScript 7.0.2** (the native compiler), **ESLint 10** on a hand-built flat config, **Tailwind v4**,
  **shadcn/ui** from the `@esg` registry, **next-intl** (English only).

## Visual design

The ESG Design System is the source, as in the service. `components.json` maps `@esg` to the registry, and the theme,
`ui/`, `layout/`, `lib/utils.ts` and `fonts/` are installed files. A fix goes upstream into the design system and
comes back through the registry. `src/app/colour-guard.test.ts` fails on any hand-written colour.

## Don'ts

- Don't run `npx tsc` or a bare `tsc`: `node_modules/.bin/tsc` is TypeScript 6 and exits 0 against the wrong
  compiler. Always use `npm run typecheck`.
- Don't remove the `typescript-eslint` override or `scripts/eslint-ts6.cjs` until typescript-eslint supports
  TypeScript 7.1 or later.
- Don't add `eslint-config-next`.
- Don't add a second parse pass. The link map, search index and tree all derive from one `parsePages`.
- Don't build a server-side PDF path. Save as PDF is the browser's print.
- Don't bind to `0.0.0.0` or add a public deploy without first adding access control. There is none.
- Don't write to a wiki folder anywhere but `local-write.ts`, reached only through `savePageAction`. It saves an existing `.md` page inside the wiki's real root, never creates or deletes files, refuses when the file changed since it was opened, and is off when `WIKI_READ_ONLY=true`. Committing and pushing stay the person's own git steps.
- Don't write the config file except through `writeUserConfig`, reached from `changeSettingsAction` after the Host check (`isLocalHost`: only `127.0.0.1:<port>` or `localhost:<port>`), or from the `wiki-renderer add` / `remove` CLI commands (a local process: no Host check, the same `checkNewFolder`). A new Settings change goes through `applyChange`, which re-reads the file before it writes.
- Don't save the editor's Markdown as is: always go through `mergeEdit`, which keeps what the person didn't touch byte-identical.
- Don't ship `.env*`, `src/` or `tests/` in an archive, and don't bind the packaged server to anything but `127.0.0.1`: `scripts/package.mjs` deletes them and the launcher sets `HOSTNAME`; keep both when you change either.
- Don't add brand colours, radii, shadows or fonts by hand.

## Delivery records

Delivery records for this repo go in its code wiki under `wiki/` (`contracts/`, `reviews/`, `verification/`,
`census/`, `measurements/`). Product decisions and architecture live in the `project-management` vault.
