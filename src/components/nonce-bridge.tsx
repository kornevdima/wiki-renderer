"use client";

import { getNonce, setNonce } from "get-nonce";

/**
 * **Update 2026-09-30 (S06 wave 2, operator R-1 and R-8): the "CSP is completely unchanged" statements below describe
 * 2026-09-22 and are no longer true.** The CSP now carries `style-src-attr 'unsafe-inline'` and `style-src-elem 'self'
 * 'unsafe-inline'`. Those two sub-directives override `style-src` for style attributes and `<style>` elements, so the
 * nonce on `style-src` is now the fallback directive only and governs no style sink a modern browser uses. This
 * bridge is therefore belt-and-braces: harmless, still correct, kept (removing it is out of scope), and it is no
 * longer what lets Radix's `<style>` through.
 *
 * Hands this request's CSP nonce (`src/lib/security-headers.ts`, forwarded
 * on the request as `x-nonce`, read by `src/app/layout.tsx`) to `get-nonce`
 * — the tiny module `react-style-singleton` (a `react-remove-scroll` /
 * `radix-ui` dependency) reads via `getNonce()` at the moment it injects a
 * `<style>` element (e.g. the Dialog primitive's body-scroll-lock
 * stylesheet), setting that tag's own `nonce` attribute if one is set.
 *
 * **Why this needs no CSP change (US-121+US-123 contract, A2 revisited):**
 * A2 first tried widening the CSP (`style-src-attr`, then `style-src-elem`)
 * to let Radix's injected `<style>` through — the operator ruled that
 * broader than agreed. `getNonce()`/`setNonce()` is `get-nonce`'s own
 * documented mechanism for exactly this (`react-style-singleton`'s own
 * dependency, no code of its own to trust beyond what's already in the
 * tree — confirmed a single, hoisted copy via `npm ls get-nonce`, so this
 * component's `setNonce` call and `react-style-singleton`'s own `getNonce`
 * read share the same module-scoped variable). `style-src`'s EXISTING
 * per-request nonce already allows any inline style carrying it — the CSP
 * itself is completely unchanged.
 *
 * **Why this must run in the component BODY, not a `useEffect`:** the value
 * has to be set before ANY descendant's own mount-time effect can read it —
 * `react-style-singleton`'s injection happens inside its OWN
 * `React.useEffect` (`node_modules/react-style-singleton/dist/es2015/hook.js`),
 * and React commits a render pass, then runs effects children-first; an
 * effect in this component would race a descendant's effect in the very
 * same commit and could easily lose. A synchronous call in the render body
 * runs before any effect anywhere in the tree, every time.
 *
 * **Why the write must be first-wins, not every-render (BUG, US-133+US-134
 * change G, tester-found, reproduced 7/7).** An earlier version of this
 * component called `setNonce(nonce)` unconditionally on every render,
 * reasoning that a plain assignment is idempotent and therefore harmless.
 * That reasoning missed a real case: a Server Action that calls
 * `revalidatePath` (e.g. `createInviteAction`, `createTenantAction`) makes
 * Next.js re-render this root layout as part of the SAME already-live
 * document — and that RSC payload carries a **freshly generated** nonce
 * (`src/lib/security-headers.ts` mints one per request/response, not per
 * document). Overwriting `get-nonce`'s module state with that new value
 * left it out of sync with the nonce the browser's CSP header actually
 * enforces for the document already on screen — the ONE nonce that matters
 * is the one the document was originally served with, and that never
 * changes for the document's whole lifetime, no matter how many Server
 * Actions revalidate parts of it. The next Radix `<style>` injection
 * (e.g. opening a dialog right after the revalidated list re-renders, with
 * no full reload) then carried the NEW nonce and was blocked by the
 * browser: `"Refused to apply inline style … nonce required"`. Reproduced
 * on `/admin/invites` (create an invite, then open the revoke dialog
 * without reloading) — and would reproduce identically on any other screen
 * that revalidates and then opens a Radix dialog, e.g. `/admin/tenants`
 * (create a tenant, then open the remove dialog without reloading),
 * because this component is the ONE shared bridge every such screen renders
 * through (see "Rendered once, near the root" below) — the bug was never
 * screen-specific, so the fix and its proof (`nonce-bridge.test.ts`) below
 * are also screen-agnostic and cover every current and future caller by
 * construction, not by enumerating call sites.
 *
 * The fix: **first write wins per document.** Only set the nonce when
 * nothing is set yet (`if (nonce && !getNonce()) setNonce(nonce)`). The
 * first render of a document (the initial server render, before hydration)
 * is always the one carrying the nonce the CSP header for THAT document
 * actually names; every later render — hydration's own first pass, and any
 * `revalidatePath`-triggered re-render afterward — must leave it alone.
 *
 * Rendered once, near the root (`src/app/layout.tsx`) — not scoped to the
 * admin console specifically — so any future Radix-based UI anywhere in the
 * app (e.g. the `cmdk` search palette, ADR-014) is covered by the same one
 * wire-up, not a second copy of this reasoning.
 *
 * **The cross-request-race invariant this relies on (review r1 minor,
 * 2026-09-22 — stated explicitly, not left implicit in `node_modules`).**
 * This component's render body runs BOTH server-side (Next.js server-renders
 * a client component for the initial HTML/RSC streaming pass, same as any
 * other) and client-side (hydration). `get-nonce`'s `currentNonce`
 * (`node_modules/get-nonce/dist/es2015/index.js`) is an unscoped,
 * process-wide module variable — in the standalone server handling
 * concurrent requests in one Node process (the Docker/Cloud Run deploy
 * shape), that is shared, mutable state ACROSS requests, not per-request
 * state. Writing it here, on the server side, is in principle a race
 * between concurrent requests, whether that write happens on every render
 * (the earlier, buggy shape) or only on the first (the current, fixed
 * shape) — first-write-wins doesn't add a new server-side race, it just
 * changes WHICH request's value a racing write would settle on. That
 * distinction ends up not mattering, for the same reason given next.
 *
 * In practice this race has no observable effect on any request's markup
 * today, for a reason that lives entirely in a transitive dependency's
 * internals, not in this codebase: `getNonce()` is called exclusively from
 * `react-style-singleton`'s `makeStyleTag()`
 * (`node_modules/react-style-singleton/dist/es2015/singleton.js`), itself
 * called only from inside a `React.useEffect`
 * (`node_modules/react-style-singleton/dist/es2015/hook.js`) and guarded by
 * `if (!document) return null`. React never runs effects during
 * server-side rendering, and `document` doesn't exist in Node — so that
 * read genuinely never executes during SSR, only after hydration, in the
 * browser tab that owns the single request it's rendering. The soundness
 * here is an invariant of **`react-style-singleton@2.2.3`** (verified
 * against that exact version, resolved transitively via `radix-ui@1.6.7` →
 * `@radix-ui/react-dialog` → `react-remove-scroll` → `react-style-singleton`
 * — confirmed with `npm ls react-style-singleton`), not something this
 * repository pins directly or has a spec for. Since the SERVER-side value of
 * `currentNonce` is never read during any SSR pass, first-write-wins settling
 * on whichever concurrent request's server render happened to run first
 * (and then staying there, unread, for the rest of the process's life) is
 * exactly as harmless as the old every-render write was — dead state either
 * way. What the fix actually changes is CLIENT-side behaviour, in the one
 * browser tab that owns a given document: there, `get-nonce`'s module
 * instance is that tab's own (not shared across tabs or with the server),
 * and it genuinely is read, from `react-style-singleton`'s effect, every
 * time a Radix primitive mounts a new `<style>` tag — including after a
 * Server Action's `revalidatePath` re-renders this component in place with
 * a freshly minted nonce the tab's live document was never actually served
 * with. That client-side case is what BUG (above) is about.
 *
 * **What breaks if that changes:** `react-style-singleton` is NOT itself an
 * exact-pinned direct dependency here (only `get-nonce` is) — a future
 * transitive version bump is free to change this. If a later version ever
 * calls `getNonce()` synchronously during render (not inside an effect), or
 * during SSR specifically, the cross-request race stops being theoretical:
 * one request's nonce could leak into a concurrent, unrelated request's
 * server-rendered `<style>` tag, which the browser receiving THAT markup
 * would then either reject (a real, user-visible CSP violation on someone
 * else's page) or — worse — silently accept if nonces happened to collide.
 * Nothing here would catch that regression; it would need to be discovered
 * the same way this invariant was, by reading the new version's source.
 */
export interface NonceBridgeProps {
  nonce?: string;
}

export function NonceBridge({ nonce }: NonceBridgeProps) {
  if (nonce && !getNonce()) {
    setNonce(nonce);
  }
  return null;
}
