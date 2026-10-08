import { describe, expect, it } from "vitest";
import { treeScrollTop, type TreeScrollInput } from "./scroll-offset";

const BASE: TreeScrollInput = { navTop: 100, navHeight: 400, navScrollTop: 0, navScrollHeight: 2000, linkTop: 1100, linkHeight: 32 };

describe("treeScrollTop (US-219, TC-510)", () => {
  it("centres a link below the visible box", () => {
    // The link sits 1000px below the nav's top: centre it, 1000 - 200 + 16 = 816.
    expect(treeScrollTop(BASE)).toBe(816);
  });
  it("centres a link above the visible box, from a scrolled nav", () => {
    expect(treeScrollTop({ ...BASE, navScrollTop: 1000, linkTop: -400 })).toBe(1000 + (-400 - 100) - 200 + 16);
  });
  it("leaves a link that is fully inside the visible box (a short tree, or a page already in view)", () => {
    expect(treeScrollTop({ ...BASE, linkTop: 150 })).toBeNull();
    expect(treeScrollTop({ ...BASE, linkTop: 100 })).toBeNull();
    expect(treeScrollTop({ ...BASE, linkTop: 100 + 400 - 32 })).toBeNull();
  });
  it("moves a link that is only partly inside", () => {
    expect(treeScrollTop({ ...BASE, linkTop: 100 + 400 - 10 })).not.toBeNull();
  });
  it("does nothing for a tree that fits its area", () => {
    expect(treeScrollTop({ ...BASE, navScrollHeight: 400, linkTop: 900 })).toBeNull();
    expect(treeScrollTop({ ...BASE, navScrollHeight: 300 })).toBeNull();
  });
  it("does nothing for a link with no box (a closed folder lays it out at zero) or a hidden nav", () => {
    expect(treeScrollTop({ ...BASE, linkTop: 0, linkHeight: 0 })).toBeNull();
    expect(treeScrollTop({ ...BASE, navHeight: 0 })).toBeNull();
  });
  it("never returns NaN, Infinity or an out-of-range number", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const key of Object.keys(BASE) as (keyof TreeScrollInput)[]) expect(treeScrollTop({ ...BASE, [key]: bad })).toBeNull();
    }
    expect(treeScrollTop({ ...BASE, linkTop: 1e6 })).toBe(1600);
    expect(treeScrollTop({ ...BASE, navScrollTop: 50, linkTop: -1e6 })).toBe(0);
  });
  it("returns null when the answer is where the nav already is", () => {
    expect(treeScrollTop({ ...BASE, navScrollTop: 1600, linkTop: 1e6 })).toBeNull();
    expect(treeScrollTop({ ...BASE, navScrollTop: 0, linkTop: -1e6 })).toBeNull();
  });
});
