# wiki-renderer (local)

Read your Obsidian-flavoured Markdown wikis in the browser, from the folders they already live in.
It handles wikilinks, embeds, callouts, Mermaid, highlighted code, frontmatter, full-text search, save as PDF and the source view.
You can also edit a page in place and save it back to its file.

This README is for people using the app. The developer guide is `AGENTS.md`.

## Setup

You need Node 24.

```bash
git clone https://github.com/kornevdima/wiki-renderer.git
cd wiki-renderer
npm install
cp .env.local.example .env.local
```

Open `.env.local` and set `WIKI_DIRS` to your wiki's folder, for example `WIKI_DIRS=notes=~/notes/wiki`.
The wiki list can also live in a config file in your user config folder (`WIKI_RENDERER_CONFIG` names it), which `WIKI_DIRS` overrides: see `.env.local.example` and `AGENTS.md`.
Then start the app:

```bash
npm run dev
```

Open http://127.0.0.1:3000.

The app listens on `127.0.0.1` only, so only this machine can open it. Nothing in the app is access-controlled:
there is no sign-in, and anyone who can reach the port can read every configured wiki and, unless
`WIKI_READ_ONLY=true`, save changes to its files.

Changes you make to the files in another editor show on the next request, after `WIKI_RECHECK_MS` (1 second by
default). Changes to `.env.local` need a restart of `npm run dev`.

## Install

You do not need Node, git or `npm install` for this. One line downloads the build for your system, checks it against the release's `SHA256SUMS`, and puts `wiki-renderer` on your PATH.

macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/kornevdima/wiki-renderer/main/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/kornevdima/wiki-renderer/main/install.ps1 | iex
```

Then run `wiki-renderer`.

- **Where it goes:** `~/.wiki-renderer/<version>/` on macOS and Linux, `%LOCALAPPDATA%\wiki-renderer\<version>\` on Windows. `wiki-renderer` in the `bin` folder beside them points at the current version. `WIKI_RENDERER_HOME` names another folder.
- **The PATH:** on Windows the script adds `bin` to your user PATH (open a new terminal). On macOS and Linux it prints the one line to add to your shell's rc file (`~/.zshrc`, `~/.bashrc`, `~/.bash_profile` or `~/.profile`) when `bin` is not already on the PATH; it never edits the file itself.
- **Update:** run the same line again. The new version is unpacked beside the old one and `bin` points at it; older versions stay (delete a folder to remove it). Running it when the latest is already installed says so and changes nothing. Your wikis and your config file are never touched.
- **A chosen version:** `WIKI_RENDERER_VERSION=0.2.0` for the install command: `curl -fsSL https://raw.githubusercontent.com/kornevdima/wiki-renderer/main/install.sh | WIKI_RENDERER_VERSION=0.2.0 sh`, or `$env:WIKI_RENDERER_VERSION = '0.2.0'` before the `irm` line. Going back to a version that is already installed moves `bin` back without a download.
- **Update notice:** off by default, so the app makes no request to anywhere. Start it with `wiki-renderer --check-updates`, or set `WIKI_RENDERER_UPDATE_CHECK=1`, and it asks GitHub for the latest release at most once a day (a plain request that sends nothing about your machine or wikis; the answer is kept in `update-check.json` beside `config.json`). If a newer version exists it prints one line with the command to install it. Being offline never delays or fails the start.
- **Refusals:** a checksum that does not match stops the install and deletes the download. An OS or CPU with no build, or a machine with neither `curl` nor `wget`, gets one line saying so.
- **No warning:** `curl` and `irm` do not set the flag that makes macOS Gatekeeper or Windows SmartScreen ask about a browser download, so the scripts never trigger it.

## Install from a release by hand

Each release on GitHub (https://github.com/kornevdima/wiki-renderer/releases)
carries one archive per system, with its own copy of Node 24 inside:

| System | Archive |
|---|---|
| macOS, Apple silicon | `wiki-renderer-<version>-darwin-arm64.tar.gz` |
| macOS, Intel | `wiki-renderer-<version>-darwin-x64.tar.gz` |
| Linux, x64 | `wiki-renderer-<version>-linux-x64.tar.gz` |
| Linux, arm64 | `wiki-renderer-<version>-linux-arm64.tar.gz` |
| Windows, x64 | `wiki-renderer-<version>-win-x64.zip` |

1. Download the archive for your system, and `SHA256SUMS` if you want to check it (`shasum -a 256 -c SHA256SUMS --ignore-missing` on macOS, `sha256sum --ignore-missing -c SHA256SUMS` on Linux).
2. Unpack it anywhere you can write to. It makes one folder, `wiki-renderer-<version>-<system>`.
3. Run the launcher in that folder: `./wiki-renderer` on macOS and Linux, `wiki-renderer.cmd` on Windows.

The app starts on http://127.0.0.1:4700 and opens your browser. It listens on `127.0.0.1` only and works without a network connection.

```bash
./wiki-renderer                       # start on port 4700 (or the next free one) and open the browser
./wiki-renderer --port 4800 --no-open # a port of your own, no browser
./wiki-renderer --verbose             # also show the server's own output
./wiki-renderer --check-updates       # say if a newer version exists (see Install, Update notice)
./wiki-renderer add ~/notes/wiki      # add a wiki (a relative folder starts from where you typed this)
./wiki-renderer add . --id notes      # the same, naming it
./wiki-renderer list                  # id, name and folder of each wiki
./wiki-renderer remove notes          # take it off the list; the folder is not touched
./wiki-renderer --version
./wiki-renderer --help
```

- **Wikis:** `add` and `remove` change the same config file as the app's Settings page and refuse for the same reasons. Settings (the settings menu, then Settings) shows the version at the bottom.
- **Output:** `start` prints only its own lines (the port notice, then "is running at") and any warning or error. `--verbose` shows the server's own banner and log as well.
- **The port:** 4700 by default, so it stays clear of the 3000 other local dev servers use. If 4700 is taken the app uses the next free port up to 4709 and says so (`Port 4700 is in use, using 4701.`); if all ten are taken it says so and exits with status 1. A port you choose is never moved. In order: `--port`, then the `WIKI_RENDERER_PORT` environment variable, then `port` in the config file (also the Port field under Server on the Settings page, which applies the next time the app starts), then the default. If a port you chose is busy it prints `Port <n> is in use. Try --port <other>.` and exits with status 1.
- **`WIKI_DIRS`:** when it is set it decides the list, and `add` and `remove` refuse. `list` shows that list.
- **The archives are not signed.** A browser download carries a flag that makes the system ask once. Clear it for the unpacked folder:
  - macOS: `xattr -dr com.apple.quarantine wiki-renderer-<version>-darwin-arm64`
  - Windows: `Get-ChildItem -Recurse wiki-renderer-<version>-win-x64 | Unblock-File` (or, before unzipping, right-click the zip, Properties, Unblock).
  - A download with `curl` does not carry the flag, so the one-line install scripts above never ask.

## Several wikis

`WIKI_DIRS` takes a comma-separated list. Each entry is either `id=folder` or a bare folder:

```bash
WIKI_DIRS=notes=~/notes,~/code/project-management/wiki
```

This serves two wikis:

| Entry | Id | Name in the app | Address |
|---|---|---|---|
| `notes=~/notes` | `notes` (as written) | Notes | http://127.0.0.1:3000/w/notes |
| `~/code/project-management/wiki` | `project-management` | Project Management | http://127.0.0.1:3000/w/project-management |

- **Id from a bare folder:** the folder's name, or its parent folder's name when the folder is called `wiki`. It is
  lowercased, and anything other than letters and digits becomes a dash (`My Notes` becomes `my-notes`).
- **Id rule:** lowercase letters, digits and dashes, starting with a letter or a digit.
- **Each id must be unique.** Two folders called `wiki` whose parents have the same name get the same id, so give one
  of them its own id with `id=folder`.
- **Paths:** `~/` starts from your home folder. A relative path starts from this repository's folder.
- **The home page:** with one wiki, `/` opens it straight away. With several, `/` lists them in the order you wrote.

A bad list stops the server at startup. It prints one error line and exits, for example
`WIKI_DIRS: id "My_Notes" must be lowercase letters, digits and dashes` or `WIKI_DIRS: id "wiki" is listed twice`.
A folder that does not exist does not stop startup: its pages show "Temporarily unavailable".

## Configuration

Set these in `.env.local`. Only `WIKI_DIRS` is required. `.env.local.example` lists them with their defaults.

| Variable | Default | What it does |
|---|---|---|
| `WIKI_DIRS` | none (required) | The wikis to serve. See [Several wikis](#several-wikis). |
| `WIKI_RECHECK_MS` | `1000` | How often, in milliseconds, a request checks the wiki folder for changes. Within this window the app serves what it already has. |
| `WIKI_MAX_BYTES` | `52428800` (50 MiB) | The most one wiki may load into memory, in bytes. See [The size cap](#the-size-cap). |
| `WIKI_SNAPSHOT_STALE_NOTICE_MS` | `0` | When a wiki that loaded before can no longer be loaded, the app keeps showing the last good copy. After this many milliseconds it adds the notice "Content may be out of date". `0` shows it at once. |
| `WIKI_READ_ONLY` | `false` | `true` hides Edit and refuses saves and image uploads, so the app never writes to a wiki folder. |
| `WIKI_PRINT_FILE_TITLE` | `false` | A page with no `title` in its frontmatter and no heading of its own gets its file name as a heading. That heading shows on screen but is left out of print; `true` prints it too. |
| `BRAND_NAME` | `Wiki Renderer` | The name in the header. |
| `BRAND_PRODUCT` | `Wikis` | The product line next to the name. |
| `BRAND_INITIALS` | from `BRAND_NAME` (`WR`) | One or two letters on the logo square. |
| `BRAND_TONE` | `indigo` | The logo square's colour: `indigo`, `deep` or `glow`. |
| `BRAND_LOGO` | none (the initials show) | Path to an image file (PNG, JPG, SVG or WebP) shown instead of the initials. |
| `BRAND_TITLE` | the value of `BRAND_NAME` | The end of every browser tab title: `<page> · <wiki> · Wiki Renderer` by default. |
| `LOG_LEVEL` | `debug` with `npm run dev`, `info` with `npm start` | How much the server logs: `fatal`, `error`, `warn`, `info`, `debug` or `trace`. |
| `PORT` | `3000` | The port. Next.js reads it from the shell when it starts, so set it there: `PORT=3001 npm run dev`. |
| `NODE_ENV` | set by Next.js | `development` for `npm run dev`, `production` for `npm start`. Don't set it yourself. |

### The size cap

`WIKI_MAX_BYTES` limits how much of one wiki the app reads into memory.

**What counts.** The total size of every file in the wiki folder, at every depth: Markdown, images, PDFs and any
other attachments. Only these are skipped: `.git`, `node_modules`, `.obsidian`, `.trash` and `.DS_Store`. Every other
folder counts, dot folders included.

**Why there is a cap.** The app reads the whole folder into memory and builds its pages, links and search index from
it. It does this again after every change, and while the new copy builds, the old one stays in memory. Without a cap,
a wiki that is too big would make the server run out of memory instead of showing a clear error.

**Why 50 MiB.** The hosted renderer this app comes from uses the same 50 MiB for the same check. Until 2026-10-17
the default here was 200 MB, with no recorded reason. Measured on 2026-10-17 with Node 24 and its default memory
limit (about 4.2 GB on the test machine), building each wiki outside the app:

| Wiki | Build time | Memory for one copy |
|---|---|---|
| This project's own wiki: 853 pages, 5 MB of Markdown | 6 s | about 100 MB of JavaScript heap |
| 191 MB: 5 MB of Markdown plus 186 MB of images | 6 s | about 400 MB, mostly the file bytes |
| 40 MB of Markdown | 43 s | about 740 MB of JavaScript heap |
| 100 MB of Markdown | 2 min | the first build worked; the rebuild after a change ran out of memory |
| 199 MB of Markdown | — | ran out of memory on the first build |

Markdown costs about 18 to 20 times its size in memory. At 50 MiB, a wiki that is all Markdown needs about 1 GB per
copy, about 2 GB while a rebuild holds two copies (an estimate from the 40 MB run). That fits Node's default limit,
so the cap shows a clear error before the server runs out of memory. A wiki that is mostly images can go well past
50 MiB safely: raise the cap for it.

**What you see when a wiki is over the cap.**

- If the wiki has not loaded since the server started, its pages show "Temporarily unavailable" ("We can't reach this
  wiki's source right now. Try again in a moment.") with a **Try again** button.
- If the wiki loaded before and then grew past the cap, the app keeps showing the last good copy with the notice
  "Content may be out of date, last updated HH:MM UTC." A restart drops that copy.
- The terminal logs `runtime.build_failed` with the message `wiki is N bytes, over the M-byte limit`.
- The list on `/` still shows the wiki.

**How to raise it.** Set `WIKI_MAX_BYTES` in `.env.local` to a number of bytes, for example
`WIKI_MAX_BYTES=209715200` for 200 MB, and restart `npm run dev`. Above 50 MiB of Markdown, Node may also need more
memory, for example `NODE_OPTIONS=--max-old-space-size=8192 npm run dev`.

## Editing

Every page has **Edit**. **Save** (or ⌘S / Ctrl S) writes the page's Markdown file in the wiki folder. The app does
not commit or push: you do that with git. If the file changed on disk after you opened it, nothing is saved; reload
and edit again. Images you add are saved into an `assets/` folder at the wiki's root.

`WIKI_READ_ONLY=true` hides Edit and refuses saves and uploads. The "Editing" section of `AGENTS.md` explains how a
save keeps untouched text byte-identical, and the other details.

## Branding

By default the app is called **Wiki Renderer**, the product line is **Wikis**, the logo is a **WR** square on the
indigo ground, and tab titles end "· Wiki Renderer". To use your own branding, set the `BRAND_*` variables, for
example:

```bash
BRAND_NAME="The Firm"
BRAND_TITLE="The Firm Wikis"
BRAND_LOGO=/path/to/logo.png
```

## License

MIT, see `LICENSE`. The Figtree and Lilex fonts in `src/fonts/` are under the SIL Open Font License (their `*-OFL.txt`).
