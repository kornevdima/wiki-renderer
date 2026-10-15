---
type: verification
title: "Page editing and image uploads, 2026-10-16"
status: pass
created: 2026-10-16
updated: 2026-10-16
feature: page-editing
commits: [b504b6f, 302fc23]
branch: feat/page-editing
design_system: v49 (installed), v50 (preview card only)
tags: [verification, editing, uploads]
---

# Page editing and image uploads, 2026-10-16

Operator rulings (project-management vault, DEC-016 note 2026-10-16): the editor lives in this repo ("Keep the public copy"),
the library stays read-only ("Local only for now"), the toolbar and dialogs are ESG components ("Toolbar + both dialogs"),
uploads go to one folder ("One assets/ folder"). Copy accepted in two rounds.

## Result: PASS

| Check | Result |
|---|---|
| Vault gate, unchanged save (847 pages of the project-management vault, real MDXEditor in jsdom) | 835/835 byte-identical; 12 pages don't parse and open as source |
| Vault gate, one-paragraph edit stays in its block, HTML comments kept | 648/648 |
| Vault gate, mid-line edit lands byte-exact | 643/648 (the 5: the editor rewrites a code-span URL into a link, or collapses a triple-backtick span) |
| Unit (`npm test`) | 119 files, 1,774 tests |
| e2e smoke (`npm run test:e2e`) | 4/4 |
| typecheck, lint | clean |

## Browser (chrome-devtools, a scratch copy of the vault, 1440 px, light and dark)

- Rich edit saved with ⌘S: a one-line diff, nothing else touched.
- Source mode (a page with `<screen>`-like text): typed text saved exactly where it was typed.
- File changed on disk behind the editor: save refused with the conflict alert; disk untouched.
- Toolbar: every button 36×36, the text style 36 high, groups wrap whole.
- Image upload: `assets/Flow-Diagram.png` written (safe name), the address `../assets/Flow-Diagram.png` filled in, the preview
  loaded through `latest-asset`, the save a one-line diff.
- Link dialog and image controls are ESG components.

## Known

- The editor drops HTML comments; the merge keeps them (attached to the block after them).
- A deleted block's neighbouring comments are lost with it.
- Lines the editor itself rewrites (code-span URLs) take the editor's text when edited.
- The dev-mode CSP `eval` console error is the app's, not the editor's.
