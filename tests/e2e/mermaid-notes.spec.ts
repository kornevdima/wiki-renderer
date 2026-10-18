// BUG-069: a Mermaid note is a group-tone box with the diagram ink in both themes. The fixture page "Mermaid notes" draws a note in
// every diagram type that has one (sequence, class, state, state with the legacy keyword). For each note the spec reads the computed
// fill of the shape under its text and the computed colour of the text, and checks the fill is `--diagram-group` and the ratio >= 4.5.
import { expect, test } from "@playwright/test";

const PAGE = "/w/sample/guides/Mermaid%20notes.md";
const KINDS = ["sequence", "class", "state", "state-legacy"] as const;

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: every Mermaid note fills with the group token and its text holds 4.5:1`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1100, height: 1000 }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto(PAGE);
    await expect(page.locator('[data-mermaid-state="drawn"]')).toHaveCount(KINDS.length, { timeout: 30_000 });

    const notes = await page.evaluate((kinds) => {
      const channels = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).map(Number);
      const lum = (c: number[]): number => {
        const f = (v: number): number => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
      };
      // The expected fill: the token itself, resolved by the browser.
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--diagram-group)";
      document.body.append(probe);
      const group = getComputedStyle(probe).backgroundColor;
      const border = (() => {
        probe.style.backgroundColor = "var(--diagram-group-border)";
        return getComputedStyle(probe).backgroundColor;
      })();
      probe.remove();

      const out: Array<{ kind: string; text: string; fill: string; stroke: string; ink: string; ratio: number }> = [];
      document.querySelectorAll("[data-mermaid-id] svg").forEach((svg, i) => {
        const seen = new Set<string>();
        for (const t of svg.querySelectorAll("text, foreignObject p")) {
          const text = (t.textContent ?? "").trim();
          if (!/note/i.test(text) || seen.has(text)) continue;
          seen.add(text);
          const box = t.getBoundingClientRect();
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          let best: { el: Element; area: number } | null = null;
          for (const shape of svg.querySelectorAll("rect, path, polygon")) {
            if (shape.closest("marker")) continue;
            const r = shape.getBoundingClientRect();
            if (r.width === 0 || cx < r.x || cx > r.x + r.width || cy < r.y || cy > r.y + r.height) continue;
            const cs = getComputedStyle(shape);
            if (cs.fill === "none" || cs.fill === "rgba(0, 0, 0, 0)") continue;
            if (!best || r.width * r.height < best.area) best = { el: shape, area: r.width * r.height };
          }
          const shape = getComputedStyle(best!.el);
          const ink = t.tagName.toLowerCase() === "text" ? getComputedStyle(t).fill : getComputedStyle(t).color;
          const a = lum(channels(shape.fill));
          const b = lum(channels(ink));
          out.push({ kind: kinds[i]!, text, fill: shape.fill, stroke: shape.stroke, ink, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
        }
      });
      return { group, border, out };
    }, [...KINDS]);

    // Sequence 3, class 2, state 2, legacy state 1.
    expect(notes.out.map((n) => n.text)).toEqual([
      "Sequence note right", "Sequence note over two", "Sequence note left",
      "Class plain note", "Class note for Animal",
      "State note right", "State note left",
      "Legacy state note",
    ]);
    for (const n of notes.out) {
      expect(n.fill, `${n.kind}: ${n.text} fill`).toBe(notes.group);
      expect(n.stroke, `${n.kind}: ${n.text} border`).toBe(notes.border);
      expect(n.ratio, `${n.kind}: ${n.text} ink ${n.ink} on ${n.fill}`).toBeGreaterThanOrEqual(4.5);
    }
    await context.close();
  });
}
