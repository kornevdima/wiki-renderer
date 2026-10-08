/**
 * S06 wave 5 resolver rules: US-077 (H), US-079 (A), US-080 (D), US-082 (C2). Through `parsePages` -> `buildLinkMap` ->
 * `resolveLink` / `resolveEmbed`; the rendered half (H1-H6) is `render/wikilink-headings.test.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";
import { describe, expect, it } from "vitest";
import { parsePages } from "@/content/render/parse";
import { slugify } from "@/content/render/slugify";
import type { FileEntry } from "@/content/runtime/types";
import { buildLinkMap } from "./link-map";
import { bareNoteCandidates, resolveEmbed, resolveLink, resolveSamePageHeading } from "./resolve";

const enc = new TextEncoder();
function mapOf(entries: Record<string, string>, wikiId = "w") {
  const files = new Map<string, FileEntry>(
    Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "x" }]),
  );
  return buildLinkMap(parsePages(files), files, wikiId, "s");
}
const link = (text: string, heading?: string) => ({ kind: "wikilink" as const, text, ...(heading !== undefined ? { heading } : {}) });
const page = (path: string, heading?: { slug?: string; matched: boolean }) => ({ kind: "page", path, ...(heading ? { heading } : {}) });
const NOT_FOUND = { kind: "unavailable", reason: "not-found" };
const AMBIGUOUS = { kind: "unavailable", reason: "ambiguous" };

describe("H: heading anchors (US-077)", () => {
  const map = mapOf({ "Note.md": "# Note\n\n## Some Heading\n\n## Repeated\n\n## Repeated\n\n### Heading: With Punctuation!\n" });
  it("H1: a matching heading resolves to its slug", () => {
    expect(resolveLink(map, link("Note", "Some Heading"))).toEqual(page("Note.md", { slug: "some-heading", matched: true }));
  });
  it("H1: the heading text is slugified by the one slug function, so case and punctuation do not matter", () => {
    expect(resolveLink(map, link("Note", "some heading"))).toEqual(page("Note.md", { slug: "some-heading", matched: true }));
    expect(resolveLink(map, link("Note", "Heading: With Punctuation!"))).toEqual(
      page("Note.md", { slug: "heading-with-punctuation", matched: true }),
    );
  });
  it("H2: a missing heading is a partial match on the page, never unavailable", () => {
    expect(resolveLink(map, link("Note", "Nope"))).toEqual(page("Note.md", { matched: false }));
  });
  it("H3: a missing page is unavailable whatever the heading", () => {
    expect(resolveLink(map, link("Gone", "Some Heading"))).toEqual(NOT_FOUND);
  });
  it("H4 (W5-3): duplicate headings get the measured slugs repeated and repeated-1, each reachable", () => {
    expect([...(map.headingIndex.get("Note.md") ?? [])]).toEqual(
      expect.arrayContaining(["repeated", "repeated-1"]),
    );
    expect(resolveLink(map, link("Note", "Repeated"))).toEqual(page("Note.md", { slug: "repeated", matched: true }));
    expect(resolveLink(map, link("Note", "repeated-1"))).toEqual(page("Note.md", { slug: "repeated-1", matched: true }));
  });
  it("H5: same-page resolves against the current page's own headings; a miss is the page itself, not unavailable", () => {
    expect(resolveSamePageHeading(map, "Note.md", "Some Heading")).toEqual(page("Note.md", { slug: "some-heading", matched: true }));
    expect(resolveSamePageHeading(map, "Note.md", "Missing")).toEqual(page("Note.md", { matched: false }));
    expect(resolveSamePageHeading(map, "Unknown.md", "Missing")).toEqual(page("Unknown.md", { matched: false }));
  });
  it("a path-qualified link carries the heading too", () => {
    const m = mapOf({ "f/Note.md": "## Some Heading" });
    expect(resolveLink(m, link("f/Note", "Some Heading"))).toEqual(page("f/Note.md", { slug: "some-heading", matched: true }));
  });
  it("H7 (TC-212): rows 1, 2 and 5 hold as written", () => {
    expect(slugify("Simple Heading")).toBe("simple-heading");
    expect(slugify("Heading: With Punctuation!")).toBe("heading-with-punctuation");
    expect(slugify("CamelCase123 Numbers")).toBe("camelcase123-numbers");
  });
  it("H7 (TC-212): rows 3 and 4 DIFFER from the TC text. slugify is github-slugger (TR-019, the rehype-slug algorithm) and keeps hyphen/underscore runs and edge hyphens; pinned as measured, reported as a spec conflict", () => {
    expect(slugify("  Leading and trailing spaces  ")).toBe("--leading-and-trailing-spaces--");
    expect(slugify("Multiple---Hyphens___Already")).toBe("multiple---hyphens___already");
  });
  it("H7: the parse-time id and the link-time slug are the same function's output, so the stray edge hyphens never arise from real headings or links (both sides are trimmed first)", () => {
    const m = mapOf({ "N.md": "##   Leading and trailing spaces   \n" });
    expect([...(m.headingIndex.get("N.md") ?? [])]).toEqual(["leading-and-trailing-spaces"]);
    expect(resolveLink(m, link("N", "  Leading and trailing spaces  "))).toEqual(
      page("N.md", { slug: "leading-and-trailing-spaces", matched: true }),
    );
  });
});

describe("A: aliases (US-079)", () => {
  it("A1: an alias resolves, in any case", () => {
    const map = mapOf({ "_index.md": '---\naliases: ["Requirements Index"]\n---\n# i', "x.md": "# x" });
    expect(resolveLink(map, link("Requirements Index"))).toEqual(page("_index.md"));
    expect(resolveLink(map, link("requirements index"))).toEqual(page("_index.md"));
  });
  it("A2: a page with no aliases is reachable only by its filename", () => {
    const map = mapOf({ "plain.md": "# Title Here" });
    expect(resolveLink(map, link("plain"))).toEqual(page("plain.md"));
    expect(resolveLink(map, link("Title Here"))).toEqual(NOT_FOUND);
  });
  it("A3: a filename and an alias naming the same page are not ambiguous", () => {
    const map = mapOf({ "Page A.md": "---\naliases: [page a, Other]\n---\n#" });
    expect(resolveLink(map, link("Page A"))).toEqual(page("Page A.md"));
    expect(resolveLink(map, link("Other"))).toEqual(page("Page A.md"));
  });
  it("A4: X's alias equal to Y's basename is ambiguous", () => {
    const map = mapOf({ "X.md": "---\naliases: [Y]\n---\n#", "Y.md": "#" });
    expect(resolveLink(map, link("Y"))).toEqual(AMBIGUOUS);
  });
  it("A5 (TC-214): two pages sharing an alias are ambiguous, in either insertion order", () => {
    const one = { "a.md": "---\naliases: [Shared]\n---\n#", "b.md": "---\naliases: [shared]\n---\n#" };
    const two = { "b.md": one["b.md"], "a.md": one["a.md"] };
    expect(resolveLink(mapOf(one), link("Shared"))).toEqual(AMBIGUOUS);
    expect(resolveLink(mapOf(two), link("Shared"))).toEqual(AMBIGUOUS);
    expect(mapOf(one).aliasIndex.get("shared")).toEqual(["a.md", "b.md"]);
    expect(mapOf(two).aliasIndex.get("shared")).toEqual(["a.md", "b.md"]);
  });
  it("an alias written with a .md suffix is reachable with and without it", () => {
    const map = mapOf({ "p.md": "---\naliases: [Foo.md]\n---\n#" });
    expect(resolveLink(map, link("Foo"))).toEqual(page("p.md"));
    expect(resolveLink(map, link("Foo.md"))).toEqual(page("p.md"));
    expect(map.aliasIndex.get("foo")).toEqual(["p.md"]);
  });
  it("many pages sharing one alias stay linear and deduplicated", () => {
    const entries = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`p${i}.md`, "---\naliases: [Same, same]\n---\n#"]));
    const map = mapOf(entries);
    expect(map.aliasIndex.get("same")).toHaveLength(2000);
    expect(resolveLink(map, link("Same"))).toEqual(AMBIGUOUS);
  });
  it("alias matching never applies to a path-qualified link", () => {
    const map = mapOf({ "a.md": "---\naliases: [Alias]\n---\n#", "f/b.md": "#" });
    expect(resolveLink(map, link("f/Alias"))).toEqual(NOT_FOUND);
    expect(resolveLink(map, link("Alias"))).toEqual(page("a.md"));
  });
  it("A6 (TC-448): hostile alias values never throw and are not indexed where invalid", () => {
    const fm = (v: string) => `---\naliases: ${v}\n---\n#`;
    const map = mapOf({
      "num.md": fm("123"),
      "mixed.md": fm('[null, {a: 1}, "X", [1], "  ", ""]'),
      "empty.md": fm('""'),
      "Page A.md": fm('["Page A"]'),
      "syntax.md": fm('["a#b", "a|b", "a/b", "a[b"]'),
      "case1.md": fm("[Dup Alias]"),
      "case2.md": fm("[dup ALIAS]"),
      "nested.md": fm("{a: 1}"),
    });
    expect([...map.aliasIndex.keys()].sort()).toEqual(["dup alias", "page a", "x"]);
    expect(resolveLink(map, link("x"))).toEqual(page("mixed.md"));
    expect(resolveLink(map, link("Page A"))).toEqual(page("Page A.md"));
    expect(resolveLink(map, link("Dup Alias"))).toEqual(AMBIGUOUS);
    expect(resolveLink(map, link("123"))).toEqual(NOT_FOUND);
    expect(resolveLink(map, link("a#b"))).toEqual(NOT_FOUND);
  });
  it("A6: a non-string that reaches buildLinkMap directly is skipped, not thrown on", () => {
    const pages = parsePages(new Map([["a.md", { bytes: enc.encode("#"), contentType: "x" }]]));
    const a = pages.get("a.md")!;
    const hostile = new Map([["a.md", { ...a, aliases: [1, null, {}, "ok"] as unknown as string[] }]]);
    const map = buildLinkMap(hostile, new Map(), "w", "s");
    expect([...map.aliasIndex.keys()]).toEqual(["ok"]);
  });
});

describe("D: disambiguation and the fold (US-080)", () => {
  const dup = mapOf({ "folder-a/Notes.md": "#", "folder-b/Notes.md": "#", "Project Brief.md": "#" });
  it("D1: a bare link to two same-basename files is ambiguous", () => {
    expect(resolveLink(dup, link("Notes"))).toEqual(AMBIGUOUS);
  });
  it("D2: path-qualified links reach their own file", () => {
    expect(resolveLink(dup, link("folder-a/Notes"))).toEqual(page("folder-a/Notes.md"));
    expect(resolveLink(dup, link("folder-b/Notes"))).toEqual(page("folder-b/Notes.md"));
  });
  it("D3: a bare link folds case", () => {
    expect(resolveLink(dup, link("project brief"))).toEqual(page("Project Brief.md"));
  });
  it("D4 (TC-447): composed and decomposed names are one note; lower-casing is not full case folding", () => {
    const composed = "Café";
    const decomposed = "Café";
    const a = mapOf({ [`${composed}.md`]: "#", "Straße.md": "#" });
    expect(resolveLink(a, link(decomposed))).toEqual(page(`${composed}.md`));
    expect(resolveLink(a, link(composed.toUpperCase()))).toEqual(page(`${composed}.md`));
    const b = mapOf({ [`${decomposed}.md`]: "#" });
    expect(resolveLink(b, link(composed))).toEqual(page(`${decomposed}.md`));
    expect(resolveLink(a, link("STRASSE"))).toEqual(NOT_FOUND);
    expect(resolveLink(a, link("Straße"))).toEqual(page("Straße.md"));
  });
  it("D4: path-qualified lookups are NFC-normalised on both sides but stay exact-case", () => {
    const a = mapOf({ "déjà/Note.md": "#" });
    expect(resolveLink(a, link("déjà/Note"))).toEqual(page("déjà/Note.md"));
    expect(resolveLink(a, link("Déjà/Note"))).toEqual(NOT_FOUND);
    const b = mapOf({ "déjà/Note.md": "#" });
    expect(resolveLink(b, link("déjà/Note"))).toEqual(page("déjà/Note.md"));
  });
  it("D4: path-qualified lookups work in both directions, for pages and for assets", () => {
    const nfc = "\u00e9";
    const nfd = "e\u0301";
    const pageNfc = mapOf({ [`${nfc}/N.md`]: "#", [`${nfc}/i.png`]: "x" });
    const pageNfd = mapOf({ [`${nfd}/N.md`]: "#", [`${nfd}/i.png`]: "x" });
    expect(resolveLink(pageNfc, link(`${nfd}/N`))).toEqual(page(`${nfc}/N.md`));
    expect(resolveLink(pageNfd, link(`${nfc}/N`))).toEqual(page(`${nfd}/N.md`));
    expect(resolveEmbed(pageNfc, { kind: "embed-image", text: `${nfd}/i.png` })).toEqual({ kind: "asset", path: `${nfc}/i.png` });
    expect(resolveEmbed(pageNfd, { kind: "embed-image", text: `${nfc}/i.png` })).toEqual({ kind: "asset", path: `${nfd}/i.png` });
    expect(resolveEmbed(pageNfc, { kind: "embed-image", text: `${nfd}/I.png` })).toEqual(NOT_FOUND);
  });
  it("D4: two files that differ only by NFC/NFD are ambiguous for a path link, but each is reachable by its own exact spelling", () => {
    const nfc = "\u00e9";
    const nfd = "e\u0301";
    const map = mapOf({ [`${nfc}/N.md`]: "#", [`${nfd}/N.md`]: "#", [`${nfc}/p.png`]: "x", [`${nfd}/p.png`]: "x" });
    expect(resolveLink(map, link(`${nfc}/N`))).toEqual(page(`${nfc}/N.md`));
    expect(resolveLink(map, link(`${nfd}/N`))).toEqual(page(`${nfd}/N.md`));
    expect(resolveLink(map, link(`${nfc}/n`))).toEqual(NOT_FOUND);
    expect(resolveEmbed(map, { kind: "embed-image", text: `${nfc}/p.png` })).toEqual({ kind: "asset", path: `${nfc}/p.png` });
    expect(resolveEmbed(map, { kind: "embed-image", text: `${nfd}/p.png` })).toEqual({ kind: "asset", path: `${nfd}/p.png` });
    // A third form matching neither stored spelling exactly: canonical reordering makes "a, acute, dot below" NFC-equal
    // to both "a, dot below, acute" and the precomposed "dot-below-a, acute".
    const x = "\u1ea1\u0301";
    const y = "a\u0323\u0301";
    const z = "a\u0301\u0323";
    expect(z.normalize("NFC")).toBe(x);
    const three = mapOf({ [`${x}/N.md`]: "#", [`${y}/N.md`]: "#" });
    expect(resolveLink(three, link(`${z}/N`))).toEqual(AMBIGUOUS);
    expect(resolveLink(three, link(`${x}/N`))).toEqual(page(`${x}/N.md`));
    expect(resolveLink(three, link(`${y}/N`))).toEqual(page(`${y}/N.md`));
    expect(resolveLink(mapOf({ [`${x}/N.md`]: "#" }), link(`${z}/N`))).toEqual(page(`${x}/N.md`));
    // Mixed-normalisation folder names, typed in a spelling that matches neither exactly.
    const mixed = mapOf({ "\u00e9a\u0301/N.md": "#", "e\u0301\u00e1/N.md": "#" });
    expect(resolveLink(mixed, link("\u00e9\u00e1/N"))).toEqual(AMBIGUOUS);
    expect(resolveLink(mixed, link("e\u0301a\u0301/N"))).toEqual(AMBIGUOUS);
    expect(resolveLink(mixed, link("\u00e9a\u0301/N"))).toEqual(page("\u00e9a\u0301/N.md"));
    const imgs = mapOf({ [`${x}/p.png`]: "x", [`${y}/p.png`]: "x" });
    expect(resolveEmbed(imgs, { kind: "embed-image", text: `${z}/p.png` })).toEqual(AMBIGUOUS);
  });
  it("D4: a decomposed alias is reached by a composed link", () => {
    const a = mapOf({ "p.md": "---\naliases: [Café]\n---\n#" });
    expect(resolveLink(a, link("Café"))).toEqual(page("p.md"));
  });
  it("D5 (TC-215): a path-qualified link is case-sensitive", () => {
    expect(resolveLink(dup, link("Folder-A/Notes"))).toEqual(NOT_FOUND);
  });
  const assets = mapOf({ "img/Diagram.png": "x", "a/Dup.png": "x", "b/Dup.png": "x", "Note.md": "#" });
  it("D6 (resolver): an image embed is exact-case, never folded", () => {
    expect(resolveEmbed(assets, { kind: "embed-image", text: "diagram.png" })).toEqual(NOT_FOUND);
    expect(resolveEmbed(assets, { kind: "embed-image", text: "Diagram.png" })).toEqual({ kind: "asset", path: "img/Diagram.png" });
    expect(resolveEmbed(assets, { kind: "embed-image", text: "Dup.png" })).toEqual(AMBIGUOUS);
    expect(resolveEmbed(assets, { kind: "embed-image", text: "b/Dup.png" })).toEqual({ kind: "asset", path: "b/Dup.png" });
    expect(resolveEmbed(assets, { kind: "embed-image", text: "img/diagram.png" })).toEqual(NOT_FOUND);
  });
  it("D6: an image embed never resolves to a page", () => {
    expect(resolveEmbed(assets, { kind: "embed-image", text: "Note.md" })).toEqual(NOT_FOUND);
    expect(resolveEmbed(assets, { kind: "embed-image", text: "Note.md".replace("Note", "x/Note") })).toEqual(NOT_FOUND);
  });
  it("D7 (resolver): wikilink, note embed and alias paths agree on the same input, through one function", () => {
    const map = mapOf({
      "a/Notes.md": "#",
      "b/Notes.md": "#",
      "Project Brief.md": "---\naliases: [PB]\n---\n#",
      "Other.md": "---\naliases: [Notes]\n---\n#",
    });
    for (const text of ["Notes", "project brief", "PB", "pb", "Missing", "a/Notes", "A/Notes"]) {
      expect(resolveEmbed(map, { kind: "embed-note", text })).toEqual(resolveLink(map, link(text)));
    }
    expect(resolveLink(map, link("Notes"))).toEqual(AMBIGUOUS);
    expect(resolveEmbed(map, { kind: "embed-note", text: "Notes" })).toEqual(AMBIGUOUS);
    expect(bareNoteCandidates(map, "Notes")).toEqual(["a/Notes.md", "b/Notes.md", "Other.md"]);
    expect(resolveEmbed(map, { kind: "embed-note", text: "Project Brief", heading: "X" })).toEqual(
      page("Project Brief.md", { matched: false }),
    );
  });
  it("resolveEmbed and resolveLink each refuse the other's kinds", () => {
    expect(resolveEmbed(dup, link("Notes"))).toEqual(NOT_FOUND);
    expect(resolveLink(dup, { kind: "embed-note", text: "Project Brief" })).toEqual(NOT_FOUND);
  });
});

describe("C2: confinement is structural (US-082, W5-7)", () => {
  interface Signature {
    file: string;
    name: string;
    params: { name: string; type: string }[];
  }
  /** Every exported function and function-valued const of the non-test `links/*.ts` files, read with the TS compiler API (syntax only). */
  function exportedSignatures(): Signature[] {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const out: Signature[] = [];
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !/\.(test|itest|testing)\.ts$/.test(f));
    for (const file of files) {
      const sf = ts.createSourceFile(file, readFileSync(`${dir}${file}`, "utf8"), ts.ScriptTarget.Latest, true);
      const isExported = (n: ts.Node) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const add = (name: string, fn: ts.SignatureDeclarationBase) =>
        out.push({ file, name, params: fn.parameters.map((p) => ({ name: p.name.getText(sf), type: p.type?.getText(sf) ?? "" })) });
      for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && isExported(st)) add(st.name?.text ?? "default", st);
        else if (ts.isVariableStatement(st) && isExported(st)) {
          for (const d of st.declarationList.declarations) {
            const init = d.initializer;
            if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) add(d.name.getText(sf), init);
          }
        } else if (ts.isExportAssignment(st) && (ts.isArrowFunction(st.expression) || ts.isFunctionExpression(st.expression))) {
          add("default", st.expression);
        }
      }
    }
    return out;
  }
  const count = (text: string, word: RegExp) => text.match(word)?.length ?? 0;

  it("the enumeration sees the resolvers (it is not vacuous)", () => {
    const names = exportedSignatures().map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["resolveLink", "resolveEmbed", "resolveSamePageHeading", "bareNoteCandidates", "buildLinkMap", "pageHref", "assetUrl", "resolveRelativeLink", "guardRelativeTarget"]));
  });
  it("no exported function takes a second map, a snapshot, or a wiki identity to look up with", () => {
    for (const sig of exportedSignatures()) {
      // Maps, read-only maps, link maps and snapshots counted together across ALL parameters.
      const total = sig.params.reduce((n, p) => n + count(p.type, /\b(ReadonlyMap|Map|LinkMap|WikiSnapshot)\b/g), 0);
      if (sig.name !== "buildLinkMap") expect(total, `${sig.name}(${sig.params.map((p) => p.type).join(", ")})`).toBeLessThanOrEqual(1);
      for (const p of sig.params) expect(p.type, `${sig.name}(${p.name})`).not.toMatch(/WikiSnapshot/);
      if (sig.name === "pageHref") {
        // A pure URL formatter, no lookup: it writes the id of the wiki the reader is in.
        expect(sig.params.map((p) => p.name)).toEqual(["wikiId", "path"]);
        continue;
      }
      if (sig.name === "assetUrl") {
        // Wave 7 (W7-5, S6-L4): a pure URL formatter like `pageHref`. `wikiId` and `sha` are URL parts, never a lookup key:
        // it takes no map, so there is nothing for them to look up in. Allowlisted by these exact names (and no other).
        expect(sig.params.map((p) => p.name)).toEqual(["wikiId", "sha", "repoPath"]);
        expect(sig.params.every((p) => p.type === "string")).toBe(true);
        continue;
      }
      if (sig.name === "buildLinkMap") {
        // The one builder of a map names the wiki it builds FOR; it reads no other map.
        expect(sig.params.map((p) => p.name)).toEqual(["pages", "files", "wikiId", "sha"]);
        continue;
      }
      for (const p of sig.params) expect(p.name, `${sig.name}`).not.toMatch(/^(wikiId|sha|otherWiki)$/);
    }
  });
  it("the resolvers take the map first, and only that map", () => {
    const sigs = new Map(exportedSignatures().map((s) => [s.name, s]));
    for (const name of ["resolveLink", "resolveEmbed", "resolveSamePageHeading", "bareNoteCandidates", "resolveRelativeLink"]) {
      const params = sigs.get(name)!.params;
      expect(params[0]!.type).toBe("LinkMap");
      expect(params.slice(1).some((p) => /LinkMap/.test(p.type))).toBe(false);
    }
  });
  it("a map answers only from its own wiki: a name present only in another map is not found", () => {
    const a = mapOf({ "A.md": "#" }, "wiki-a");
    const b = mapOf({ "Only In B.md": "---\naliases: [B Alias]\n---\n#" }, "wiki-b");
    expect(resolveLink(a, link("Only In B"))).toEqual(NOT_FOUND);
    expect(resolveLink(a, link("B Alias"))).toEqual(NOT_FOUND);
    expect(resolveLink(b, link("B Alias"))).toEqual(page("Only In B.md"));
  });
});
