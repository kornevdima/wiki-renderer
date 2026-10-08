/**
 * US-104 unit specs for the pure hydration rules (`mermaid-hydrate.ts`, `mermaid-ready.ts`). The repo has no jsdom, so
 * the DOM is a minimal fake covering exactly the calls the module makes. The real browser behaviour (drawing under the
 * CSP, injection payloads, no-JS, chunk abort) is the prod-image e2e's (D1-D8).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createHydrationQueue, hydrateMermaid, MERMAID_STATE_ATTRIBUTE, type MermaidLike } from "./mermaid-hydrate";
import { diagramSetKey } from "./mermaid-hydrator";
import { beginMermaidView, getMermaidReady } from "./mermaid-ready";

class FakeEl {
  attrs = new Map<string, string>();
  children: FakeEl[] = [];
  text = "";
  isConnected = true;
  constructor(
    readonly doc: FakeDoc,
    readonly tag: string,
  ) {}
  get ownerDocument() {
    return this.doc;
  }
  getAttribute(n: string) {
    return this.attrs.get(n) ?? null;
  }
  setAttribute(n: string, v: string) {
    this.attrs.set(n, v);
  }
  removeAttribute(n: string) {
    this.attrs.delete(n);
  }
  append(other: FakeEl) {
    this.children.push(other);
  }
  hasAttribute(n: string) {
    return this.attrs.has(n);
  }
  set textContent(v: string) {
    this.text = v;
  }
  querySelector(sel: string) {
    const name = sel.slice(1, -1);
    return this.children.find((c) => c.attrs.has(name)) ?? null;
  }
  replaceWith(other: FakeEl) {
    for (const p of this.doc.all) {
      const i = p.children.indexOf(this);
      if (i >= 0) p.children[i] = other;
    }
  }
  prepend(other: FakeEl) {
    this.children.unshift(other);
  }
  replaceChildren(...content: ({ svg: string } | FakeEl)[]) {
    const first = content[0];
    this.children = first instanceof FakeEl ? (content as FakeEl[]) : [];
    this.text = first instanceof FakeEl || first === undefined ? "" : first.svg;
  }
}
class FakeDoc {
  all: FakeEl[] = [];
  body: FakeEl[] = [];
  /** US-192: what `template.content.querySelector("svg")` finds for a given markup (the parsed svg element), if a test sets it. */
  parsedSvg?: (markup: string) => unknown;
  createElement(tag: string) {
    const el = new FakeEl(this, tag);
    Object.defineProperty(el, "innerHTML", {
      set: (v: string) =>
        ((el as unknown as { content: unknown }).content = {
          svg: v,
          querySelector: (sel: string) => (sel === "svg" ? (this.parsedSvg?.(v) ?? null) : null),
        }),
    });
    Object.defineProperty(el, "content", { writable: true, value: undefined });
    return el;
  }
  getElementById(id: string) {
    const found = this.body.find((e) => e.getAttribute("id") === id);
    return found ? { remove: () => (this.body = this.body.filter((e) => e !== found)) } : null;
  }
}
function world(ids: string[]) {
  const doc = new FakeDoc();
  const els = ids.map((id) => {
    const el = doc.createElement("div");
    el.setAttribute("data-mermaid-id", id);
    const caption = doc.createElement("p");
    caption.setAttribute("data-mermaid-caption", "");
    const pre = doc.createElement("pre");
    el.children = [caption, pre];
    doc.all.push(el);
    return el;
  });
  const root = { querySelectorAll: () => els };
  return { doc, els, root: root as unknown as ParentNode, blocks: ids.map((id) => ({ id, source: `graph ${id}` })) };
}
function mermaidStub(render: MermaidLike["render"]): { m: MermaidLike; initialize: ReturnType<typeof vi.fn> } {
  const initialize = vi.fn();
  return { m: { initialize, render }, initialize };
}

describe("hydrateMermaid", () => {
  it("initialises in strict mode with no way for a diagram to lower it (D3 pin: never `loose`)", async () => {
    const w = world(["a"]);
    const { m, initialize } = mermaidStub(async () => ({ svg: "<svg/>" }));
    await hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => m, errorText: "E" });
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize.mock.calls[0]![0]).toEqual({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true });
    expect(JSON.stringify(initialize.mock.calls[0])).not.toMatch(/loose|antiscript|sandbox|secure/);
  });

  it("draws each block, replaces its children with the svg, and marks it drawn", async () => {
    const w = world(["a", "b"]);
    const render = vi.fn(async (id: string) => ({ svg: `<svg id="${id}"/>` }));
    await hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(render).m, errorText: "E" });
    expect(render.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
    expect(w.els.map((e) => e.text)).toEqual(['<svg id="a"/>', '<svg id="b"/>']);
    expect(w.els.map((e) => e.getAttribute(MERMAID_STATE_ATTRIBUTE))).toEqual(["drawn", "drawn"]);
  });

  it("draws each placeholder once per view: a second pass renders nothing", async () => {
    const w = world(["a"]);
    const render = vi.fn(async () => ({ svg: "<svg/>" }));
    const opts = { root: w.root, blocks: w.blocks, load: async () => mermaidStub(render).m, errorText: "E" };
    await Promise.all([hydrateMermaid(opts), hydrateMermaid(opts)]);
    await hydrateMermaid(opts);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("a render error is scoped: that block shows the error copy where the caption was, source kept, the next block still draws", async () => {
    const w = world(["bad", "good"]);
    const render = vi.fn(async (id: string) => {
      if (id === "bad") throw new Error("Parse error");
      return { svg: "<svg/>" };
    });
    await hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(render).m, errorText: "This diagram could not be drawn." });
    const [bad, good] = w.els as [FakeEl, FakeEl];
    expect(bad.getAttribute(MERMAID_STATE_ATTRIBUTE)).toBe("error");
    expect(bad.children[0]!.text).toBe("This diagram could not be drawn.");
    expect(bad.children[0]!.hasAttribute("data-mermaid-error")).toBe(true);
    expect(bad.children[1]!.tag).toBe("pre");
    expect(good.getAttribute(MERMAID_STATE_ATTRIBUTE)).toBe("drawn");
  });

  it("a failed render also removes Mermaid's scratch element", async () => {
    const w = world(["bad"]);
    const scratch = w.doc.createElement("div");
    scratch.setAttribute("id", "dbad");
    w.doc.body.push(scratch);
    await hydrateMermaid({
      root: w.root,
      blocks: w.blocks,
      load: async () =>
        mermaidStub(async () => {
          throw new Error("x");
        }).m,
      errorText: "E",
    });
    expect(w.doc.body).toEqual([]);
  });

  it("a chunk load failure leaves every block untouched (caption and source stay), resolves and never rejects", async () => {
    const w = world(["a", "b"]);
    await expect(
      hydrateMermaid({
        root: w.root,
        blocks: w.blocks,
        load: async () => {
          throw new Error("ChunkLoadError");
        },
        errorText: "E",
      }),
    ).resolves.toBeUndefined();
    for (const el of w.els) {
      expect(el.getAttribute(MERMAID_STATE_ATTRIBUTE)).toBe("undrawn");
      expect(el.children.map((c) => c.tag)).toEqual(["p", "pre"]);
    }
  });

  it("W2-17: a view cancelled mid-render leaves the block unmarked, so the next pass draws it", async () => {
    const w = world(["a"]);
    let cancelled = false;
    const cancelling = vi.fn(async () => {
      cancelled = true;
      return { svg: "<svg/>" };
    });
    await hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(cancelling).m, errorText: "E", isCancelled: () => cancelled });
    expect(w.els[0]!.hasAttribute(MERMAID_STATE_ATTRIBUTE)).toBe(false);
    const render = vi.fn(async () => ({ svg: "<svg/>" }));
    await hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(render).m, errorText: "E" });
    expect(render).toHaveBeenCalledTimes(1);
    expect(w.els[0]!.getAttribute(MERMAID_STATE_ATTRIBUTE)).toBe("drawn");
  });

  it("W2-16: a block whose source changed after it was drawn is drawn again exactly once; unchanged is not", async () => {
    const w = world(["a"]);
    const render = vi.fn(async (_id: string, src: string) => ({ svg: `<svg>${src}</svg>` }));
    const run = (source: string) =>
      hydrateMermaid({ root: w.root, blocks: [{ id: "a", source }], load: async () => mermaidStub(render).m, errorText: "E" });
    await run("graph A");
    await run("graph A");
    expect(render).toHaveBeenCalledTimes(1);
    await run("graph B");
    await run("graph B");
    expect(render).toHaveBeenCalledTimes(2);
    expect(w.els[0]!.text).toBe("<svg>graph B</svg>");
  });

  it("W2-16: diagramSetKey changes with path, an id or a source, and is stable for identical content", () => {
    const b = [{ id: "a", source: "graph A" }];
    expect(diagramSetKey("p.md", b)).toBe(diagramSetKey("p.md", [{ ...b[0]! }]));
    expect(diagramSetKey("p.md", b)).not.toBe(diagramSetKey("q.md", b));
    expect(diagramSetKey("p.md", b)).not.toBe(diagramSetKey("p.md", [{ id: "a", source: "graph B" }]));
    expect(diagramSetKey("p.md", b)).not.toBe(diagramSetKey("p.md", [{ id: "b", source: "graph A" }]));
    expect(diagramSetKey("p.md", b)).not.toBe(diagramSetKey("p.md", []));
  });

  it("loads nothing when the page has no placeholders", async () => {
    const load = vi.fn();
    await hydrateMermaid({ root: world([]).root, blocks: [], load, errorText: "E" });
    expect(load).not.toHaveBeenCalled();
  });

  it("stops drawing once the view is cancelled (client navigation)", async () => {
    const w = world(["a", "b"]);
    let cancelled = false;
    const render = vi.fn(async () => {
      cancelled = true;
      return { svg: "<svg/>" };
    });
    await hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(render).m, errorText: "E", isCancelled: () => cancelled });
    expect(render).toHaveBeenCalledTimes(1);
    expect(w.els[1]!.hasAttribute(MERMAID_STATE_ATTRIBUTE)).toBe(false);
  });
});

describe("R2-2: a block reset to source keeps the server caption", () => {
  const failing = async (): Promise<MermaidLike> => {
    throw new Error("ChunkLoadError");
  };

  it("a changed source after a draw is reset with the caption rebuilt, so a chunk failure still says why it is source", async () => {
    const w = world(["a"]);
    const render = vi.fn(async () => ({ svg: "<svg/>" }));
    await hydrateMermaid({ root: w.root, blocks: [{ id: "a", source: "graph A" }], load: async () => mermaidStub(render).m, errorText: "E", captionText: "CAPTION" });
    expect(w.els[0]!.children).toEqual([]);
    await hydrateMermaid({ root: w.root, blocks: [{ id: "a", source: "graph B" }], load: failing, errorText: "E", captionText: "CAPTION" });
    const el = w.els[0]!;
    expect(el.getAttribute(MERMAID_STATE_ATTRIBUTE)).toBe("undrawn");
    expect(el.children.map((c) => c.tag)).toEqual(["p", "pre"]);
    expect(el.children[0]!.hasAttribute("data-mermaid-caption")).toBe(true);
    expect(el.children[0]!.text).toBe("CAPTION");
  });

  it("with no caption copy the reset is source only, as before", async () => {
    const w = world(["a"]);
    const render = vi.fn(async () => ({ svg: "<svg/>" }));
    await hydrateMermaid({ root: w.root, blocks: [{ id: "a", source: "graph A" }], load: async () => mermaidStub(render).m, errorText: "E" });
    await hydrateMermaid({ root: w.root, blocks: [{ id: "a", source: "graph B" }], load: failing, errorText: "E" });
    expect(w.els[0]!.children.map((c) => c.tag)).toEqual(["pre"]);
  });
});

describe("R2-1: a view that starts mid-draw waits for the cancelled one, then draws the block", () => {
  function slowWorld() {
    const w = world(["a"]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let cancelled = false;
    const slow = vi.fn(async () => {
      await gate;
      return { svg: "<svg>old</svg>" };
    });
    return { w, release, slow, cancel: () => (cancelled = true), isCancelled: () => cancelled };
  }

  it("without the queue the block is left as source (the defect)", async () => {
    const { w, release, slow, cancel, isCancelled } = slowWorld();
    const first = hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(slow).m, errorText: "E", isCancelled });
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());
    cancel();
    const render = vi.fn(async () => ({ svg: "<svg>new</svg>" }));
    const second = hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(render).m, errorText: "E" });
    release();
    await Promise.all([first, second]);
    expect(render).not.toHaveBeenCalled();
    expect(w.els[0]!.hasAttribute(MERMAID_STATE_ATTRIBUTE)).toBe(false);
  });

  it("through the queue the new view draws the block the old one gave up", async () => {
    const { w, release, slow, cancel, isCancelled } = slowWorld();
    const enqueue = createHydrationQueue();
    const first = enqueue({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(slow).m, errorText: "E", isCancelled });
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());
    cancel();
    const render = vi.fn(async () => ({ svg: "<svg>new</svg>" }));
    const second = enqueue({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(render).m, errorText: "E" });
    release();
    await Promise.all([first, second]);
    expect(render).toHaveBeenCalledTimes(1);
    expect(w.els[0]!.getAttribute(MERMAID_STATE_ATTRIBUTE)).toBe("drawn");
    expect(w.els[0]!.text).toBe("<svg>new</svg>");
  });

  const hung = (): Promise<MermaidLike> => new Promise<MermaidLike>(() => undefined);
  const outcome = (p: Promise<void>): Promise<string> =>
    Promise.race([p.then(() => "settled"), new Promise<string>((r) => setTimeout(() => r("hung"), 60))]);

  it("Major 2: a view with no diagram settles at once while the previous view is still in load() (a stalled chunk)", async () => {
    const enqueue = createHydrationQueue();
    const a = world(["a"]);
    let cancelledA = false;
    void enqueue({ root: a.root, blocks: a.blocks, load: hung, errorText: "E", isCancelled: () => cancelledA });
    cancelledA = true;
    const b = world([]);
    expect(await outcome(enqueue({ root: b.root, blocks: [], load: vi.fn(), errorText: "E" }))).toBe("settled");
  });

  it("BUG-021: a view with no diagram settles at once while the previous view is mid-draw (its render() never resolves)", async () => {
    const enqueue = createHydrationQueue();
    const a = world(["a"]);
    const render = vi.fn(() => new Promise<{ svg: string }>(() => undefined));
    void enqueue({ root: a.root, blocks: a.blocks, load: async () => mermaidStub(render).m, errorText: "E" });
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    expect(a.els[0]!.getAttribute(MERMAID_STATE_ATTRIBUTE)).toBe("drawing");
    const b = world([]);
    expect(await outcome(enqueue({ root: b.root, blocks: [], load: vi.fn(), errorText: "E" }))).toBe("settled");
  });

  it("Major 2: a diagram view proceeds and draws once its predecessor is cancelled, though the predecessor's load() never resolves", async () => {
    const enqueue = createHydrationQueue();
    const a = world(["a"]);
    let cancelledA = false;
    void enqueue({ root: a.root, blocks: a.blocks, load: hung, errorText: "E", isCancelled: () => cancelledA });
    cancelledA = true;
    const b = world(["b"]);
    const render = vi.fn(async () => ({ svg: "<svg/>" }));
    expect(await outcome(enqueue({ root: b.root, blocks: b.blocks, load: async () => mermaidStub(render).m, errorText: "E" }))).toBe("settled");
    expect(b.els[0]!.getAttribute(MERMAID_STATE_ATTRIBUTE)).toBe("drawn");
  });

  it("Minor 3: onStart runs after the wait for an in-flight draw, not before", async () => {
    const { w, release, slow, cancel, isCancelled } = slowWorld();
    const enqueue = createHydrationQueue();
    const first = enqueue({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(slow).m, errorText: "E", isCancelled });
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());
    cancel();
    const events: string[] = [];
    const second = enqueue({
      root: w.root,
      blocks: w.blocks,
      load: async () => mermaidStub(async () => ({ svg: "<svg/>" })).m,
      errorText: "E",
      onStart: () => events.push("start"),
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual([]);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["start"]);
  });

  it("runs hydrations one after another, in call order", async () => {
    const enqueue = createHydrationQueue();
    const order: string[] = [];
    const w1 = world(["a"]);
    const w2 = world(["b"]);
    const firstRun = enqueue({
      root: w1.root,
      blocks: w1.blocks,
      load: async () => {
        order.push("one");
        return { initialize: () => undefined, render: async () => ({ svg: "<svg/>" }) };
      },
      errorText: "E",
    });
    const next = enqueue({
      root: w2.root,
      blocks: w2.blocks,
      load: async () => {
        order.push("two");
        return mermaidStub(async () => ({ svg: "<svg/>" })).m;
      },
      errorText: "E",
    });
    await Promise.all([firstRun, next]);
    expect(order).toEqual(["one", "two"]);
  });
});

describe("mermaidReady", () => {
  it("is resolved with no view, pending during a view, settled by settle(), and replaced (old one settled) by the next view", async () => {
    const one = beginMermaidView();
    let settled = false;
    void getMermaidReady().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    const two = beginMermaidView();
    await one.promise;
    expect(getMermaidReady()).toBe(two.promise);
    two.settle();
    await two.promise;
    expect((globalThis as { __mermaidReady?: Promise<void> }).__mermaidReady).toBe(two.promise);
    expect(Symbol.for("wiki-renderer.reader.mermaidReady") in globalThis).toBe(true);
  });
});

describe("mermaid import boundary (ADR-011)", () => {
  it("`mermaid` is imported only by the client component, never under src/content or server code", () => {
    const root = join(__dirname, "..", "..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && /import\((["'])mermaid\1\)|from (["'])mermaid\2/.test(readFileSync(p, "utf8"))) hits.push(p.slice(root.length + 1));
      }
    };
    walk(root);
    expect(hits).toEqual(["components/reader/mermaid-hydrator.tsx"]);
  });
});

describe("hydrateMermaid: naming the drawn svg (US-192)", () => {
  function fakeSvg(attrs: Record<string, string>, title?: string) {
    const map = new Map(Object.entries(attrs));
    return {
      map,
      getAttribute: (n: string) => map.get(n) ?? null,
      setAttribute: (n: string, v: string) => void map.set(n, v),
      removeAttribute: (n: string) => void map.delete(n),
      querySelectorAll: () => (title === undefined ? [] : [{ getAttribute: (n: string) => (n === "id" ? "chart-title-a" : null), textContent: title }]),
    };
  }

  it("names the parsed svg before it is attached: the generic name when the author gave no title", async () => {
    const w = world(["a"]);
    const svg = fakeSvg({ role: "graphics-document document", "aria-roledescription": "pie" });
    w.doc.parsedSvg = () => svg;
    await hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(async () => ({ svg: "<svg/>" })).m, errorText: "E", diagramName: "Diagram" });
    expect(svg.map.get("role")).toBe("img");
    expect(svg.map.get("aria-label")).toBe("Diagram");
    expect(w.els[0]!.getAttribute(MERMAID_STATE_ATTRIBUTE)).toBe("drawn");
  });

  it("names it by the author's accTitle when the source has one", async () => {
    const w = world(["a"]);
    const svg = fakeSvg({ "aria-labelledby": "chart-title-a" }, "Quarterly plan");
    w.doc.parsedSvg = () => svg;
    await hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(async () => ({ svg: "<svg/>" })).m, errorText: "E", diagramName: "Diagram" });
    expect(svg.map.get("aria-label")).toBe("Quarterly plan");
    expect(svg.map.has("aria-labelledby")).toBe(false);
  });

  it("names nothing when no generic name is passed, and never names the placeholder or an error block", async () => {
    const w = world(["ok", "bad"]);
    const svg = fakeSvg({ role: "graphics-document document" });
    w.doc.parsedSvg = () => svg;
    const render = vi.fn(async (id: string) => {
      if (id === "bad") throw new Error("Parse error");
      return { svg: "<svg/>" };
    });
    await hydrateMermaid({ root: w.root, blocks: w.blocks, load: async () => mermaidStub(render).m, errorText: "E" });
    expect(svg.map.has("aria-label")).toBe(false);
    expect(w.els.map((e) => e.getAttribute("aria-label") ?? e.getAttribute("role"))).toEqual([null, null]);
  });
});

describe("MermaidHydrator wiring (US-192)", () => {
  it("passes the generic diagram name from the mermaid copy to the hydration queue", () => {
    const source = readFileSync(join(__dirname, "mermaid-hydrator.tsx"), "utf8");
    expect(source).toMatch(/const diagramName = t\("diagramName"\)/);
    expect(source).toMatch(/enqueue\(\{[\s\S]*?\bdiagramName,/);
  });
});
