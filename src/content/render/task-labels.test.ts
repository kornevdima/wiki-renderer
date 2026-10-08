import type { Element, Root } from "hast";
import { describe, expect, it } from "vitest";
import { rehypeTaskLabels } from "./task-labels";

const el = (tagName: string, properties: import("hast").Properties = {}, children: Element["children"] = []): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});
const text = (value: string) => ({ type: "text" as const, value });
const box = () => el("input", { type: "checkbox", disabled: true });

describe("rehypeTaskLabels (US-189 fix round 1)", () => {
  it("wraps the item's own inline text in an id'd span and points the checkbox at it", () => {
    const input = box();
    const li = el("li", { className: ["task-list-item"] }, [input, text(" done "), el("strong", {}, [text("now")])]);
    rehypeTaskLabels()({ type: "root", children: [li] });
    expect(li.children).toHaveLength(2);
    const span = li.children[1] as Element;
    expect(span.tagName).toBe("span");
    expect(span.properties.id).toBe("task-label-1");
    expect(span.children).toHaveLength(2);
    expect(input.properties.ariaLabelledBy).toEqual(["task-label-1"]);
    expect(input.properties.disabled).toBe(true);
  });

  it("stops at a nested list, and names a loose item inside its paragraph", () => {
    const a = box();
    const nested = el("ul");
    const tight = el("li", {}, [a, text(" a"), nested]);
    const b = box();
    const p = el("p", {}, [b, text(" b")]);
    rehypeTaskLabels()({ type: "root", children: [tight, el("li", {}, [p])] });
    expect(tight.children[2]).toBe(nested);
    expect(((tight.children[1] as Element).children[0] as { value: string }).value).toBe(" a");
    expect(b.properties.ariaLabelledBy).toEqual(["task-label-2"]);
  });

  it("leaves a checkbox with no text after it alone, and avoids ids already in the tree", () => {
    const empty = box();
    const named = box();
    const tree: Root = {
      type: "root",
      children: [el("li", {}, [empty, text("  ")]), el("div", { id: "task-label-1" }), el("li", {}, [named, text("x")])],
    };
    rehypeTaskLabels()(tree);
    expect(empty.properties.ariaLabelledBy).toBeUndefined();
    expect(named.properties.ariaLabelledBy).toEqual(["task-label-2"]);
  });
});
