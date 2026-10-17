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
cp .env.local.example .env.local         # set WIKI_DIRS
npm run dev                              # http://127.0.0.1:3000
WIKI_DIRS="notes=~/notes/wiki" npm run dev   # or inline
```

`WIKI_DIRS` holds comma-separated `id=folder` pairs, or bare folders. A bare folder takes its id from the folder's name,
or from its parent's name when the folder is called `wiki`. With one wiki, `/` redirects straight to it. With several,
`/` lists them. Edits in the vault show on the next request after `WIKI_RECHECK_MS` (default 1 s): the folder is
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

The default brand is neutral: **Wiki Renderer** / **Wikis**, a **WR** TenantLogo (design system v31: the ESG mark's
rounded square, initials on the `indigo` ground, never the brand gradient), and tab titles ending "· Wiki Renderer".
There is no ESG logo in the repo. A deployment brands itself with `BRAND_NAME`, `BRAND_PRODUCT`, `BRAND_INITIALS` (one or
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
| `src/content/runtime/` | `config.ts` (parses `WIKI_DIRS`), `local-source.ts` (folder → files + fingerprint sha), `local-write.ts` (the only writer: saves one existing `.md` page, adds an image to `assets/`), `build.ts` (one parse → snapshot), `index.ts` (`getSnapshot`, `listWikis`, `findWiki`), `cache.ts`, `tree.ts` |
| `src/content/edit/` | `merge.ts`: the save's block-preserving merge (untouched blocks, lines and characters keep their original bytes; HTML comments kept; Obsidian syntax unescaped) |
| `src/content/render/` | Markdown → React pipeline: wikilinks, embeds, callouts, Mermaid placeholders, Shiki, sanitiser, render cache |
| `src/content/links/` | link map and resolution, asset URLs, path confinement |
| `src/content/search/` | MiniSearch index built at snapshot time; client-side query |
| `src/app/w/[wikiId]/[[...path]]/` | the reader page (landing, page, `?view=source`, `?view=edit`) and `actions.ts` (`savePageAction`, `uploadImageAction`) |
| `src/app/api/wikis/[wikiId]/{asset,source,search-index}/` | the snapshot's files, by sha; `latest-asset/` redirects the editor's image previews to the current sha |
| `src/app/page.tsx` | the wiki list, or a redirect when only one wiki is configured |
| `src/components/reader/` | reader UI (shell, sidebar, nav tree, outline, search dialog, PDF, source view, editor: `edit-view.tsx`, `edit-editor.tsx`) |
| `src/components/ui/`, `src/components/layout/`, `src/app/esg-theme.css`, `src/fonts/` | **installed** from the ESG design-system registry; don't hand-edit. Installed at design system **v57** (`esg-design-system` `703970a`, published 2026-10-17 as artifact version 125, pulled from the local registry 2026-10-17: every item re-pulled with `--overwrite` at v56 (US-288), then `width-handle` and `theme` at v57 (US-281), no forks of design components, operator ruling 2026-10-17). Restore `package.json` and `package-lock.json` after `registry-add.sh` (the CLI loosens exact pins) |
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
| `npm test` | Vitest unit suite (`src/**/*.test.ts`) |
| `npm run test:e2e` | Playwright: starts `next dev` on :3100 against `tests/fixtures/` |

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
- Don't save the editor's Markdown as is: always go through `mergeEdit`, which keeps what the person didn't touch byte-identical.
- Don't add brand colours, radii, shadows or fonts by hand.

## Delivery records

Delivery records for this repo go in its code wiki under `wiki/` (`contracts/`, `reviews/`, `verification/`,
`census/`, `measurements/`). Product decisions and architecture live in the `project-management` vault.
