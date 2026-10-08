/**
 * Unit spec for `./nonce-bridge` (US-121+US-123 contract, A2 revisited;
 * fixed for the US-133+US-134 change G nonce-mismatch bug, tester-found,
 * reproduced 7/7 — see `nonce-bridge.tsx`'s own doc comment for the full
 * diagnosis). Uses the REAL `get-nonce` module (not a mock of it) — the
 * whole point of this component is that its `setNonce` call and
 * `react-style-singleton`'s own `getNonce` read share the same
 * module-scoped variable (confirmed via `npm ls get-nonce`: a single,
 * hoisted copy in the tree), so asserting against the real `getNonce()`
 * output is the most faithful proof that the wiring actually works, not
 * just that a mock was called.
 *
 * **Ordering note.** `get-nonce` exposes no reset/clear function, and its
 * `currentNonce` is a plain, unscoped module variable that (measured)
 * `vi.resetModules()` does not actually clear here — `get-nonce` is a
 * pre-bundled dependency, cached below the layer `resetModules` reaches.
 * That module-wide persistence is exactly the real-world property under
 * test (one document, one process-wide `get-nonce` instance, for its whole
 * lifetime — see `nonce-bridge.tsx`'s own "cross-request-race invariant"
 * section), so this file leans into it rather than fighting it: the tests
 * below run in DECLARATION ORDER (vitest's default, unshuffled here) and
 * deliberately thread state through the `describe` block, the same one
 * "document" throughout. Do not reorder or parallelize these `it`s.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getNonce } from "get-nonce";
import { describe, expect, it } from "vitest";

import { NonceBridge } from "./nonce-bridge";

describe("NonceBridge — wires the request nonce into get-nonce before any descendant can mount, first write wins per document", () => {
  it("rendering with a nonce makes get-nonce's getNonce() return that exact value afterward", () => {
    renderToStaticMarkup(createElement(NonceBridge, { nonce: "test-nonce-abc123" }));
    expect(getNonce()).toBe("test-nonce-abc123");
  });

  it("a later render with a DIFFERENT nonce does NOT overwrite it — first write wins per document (the fix for the nonce-mismatch bug, US-133+US-134 change G, tester-found, reproduced 7/7 on /admin/invites: create an invite, then open the revoke dialog with no reload)", () => {
    // Continues from the previous test's state (getNonce() === "test-nonce-abc123"),
    // simulating a revalidatePath-triggered re-render of the SAME already-live
    // document, which carries a freshly minted, different nonce that must be
    // ignored — the one nonce that matters is the one first set for this
    // document, which never changes for the document's whole lifetime.
    expect(getNonce()).toBe("test-nonce-abc123");

    renderToStaticMarkup(createElement(NonceBridge, { nonce: "a-completely-different-nonce" }));
    expect(getNonce()).toBe("test-nonce-abc123");

    // A third, arbitrary render changes nothing further either.
    renderToStaticMarkup(createElement(NonceBridge, { nonce: "yet-another-nonce" }));
    expect(getNonce()).toBe("test-nonce-abc123");
  });

  it("an absent-nonce render doesn't clear or change the stored value either", () => {
    renderToStaticMarkup(createElement(NonceBridge, {}));
    expect(getNonce()).toBe("test-nonce-abc123");
  });

  it("renders no visible output — a pure bridge", () => {
    const html = renderToStaticMarkup(createElement(NonceBridge, { nonce: "any-nonce" }));
    expect(html).toBe("");
  });

  it("an absent nonce doesn't throw", () => {
    expect(() => renderToStaticMarkup(createElement(NonceBridge, {}))).not.toThrow();
  });
});
