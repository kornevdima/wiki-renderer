/**
 * `./document-title` (US-221, TC-520, SA-MOD Reader UI and print E3-D9): the one pure title helper.
 */
import { describe, expect, it } from "vitest";

import { documentTitle } from "./document-title";

const suffix = "ESG Wikis";

describe("documentTitle", () => {
  it("inside the shell: '<screen> · <wiki> · <suffix>'", () => {
    expect(documentTitle({ screen: "Rate limits", wiki: "Platform", suffix })).toBe("Rate limits · Platform · ESG Wikis");
  });

  it("outside the shell: '<screen> · <suffix>', with no wiki segment", () => {
    expect(documentTitle({ screen: "This page is unavailable", suffix })).toBe("This page is unavailable · ESG Wikis");
  });

  it("a blank wiki name adds no segment", () => {
    expect(documentTitle({ screen: "S", wiki: " \n\t", suffix })).toBe("S · ESG Wikis");
    expect(documentTitle({ screen: "S", wiki: "", suffix })).toBe("S · ESG Wikis");
  });

  it("a middle dot in a name is kept as typed", () => {
    expect(documentTitle({ screen: "P", wiki: "A · B", suffix })).toBe("P · A · B · ESG Wikis");
  });

  it("markup characters pass through as text (React escapes them as a child), never altered into an element", () => {
    const wiki = '<b>x</b> & "y"';
    expect(documentTitle({ screen: "P", wiki, suffix })).toBe(`P · ${wiki} · ESG Wikis`);
  });

  it("a newline or run of whitespace collapses to one space", () => {
    expect(documentTitle({ screen: "Rate\nlimits", wiki: "Plat\r\n\tform", suffix })).toBe("Rate limits · Plat form · ESG Wikis");
  });

  it("a very long name is kept whole: no cap, the browser shortens a long tab title itself", () => {
    const wiki = "x".repeat(300);
    expect(documentTitle({ screen: "P", wiki, suffix })).toBe(`P · ${wiki} · ESG Wikis`);
  });

  it("the not-found title cannot vary by cause: the same input gives the same string, and the input has no wiki", () => {
    const a = documentTitle({ screen: "This page is unavailable", suffix });
    const b = documentTitle({ screen: "This page is unavailable", suffix });
    expect(a).toBe(b);
    expect(a).not.toMatch(/Team|repo|branch/i);
  });
});
