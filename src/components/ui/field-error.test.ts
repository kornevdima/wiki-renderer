import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldError } from "./field-error";

// US-174 (FR-049): the field message is a live alert in the danger token, carries an icon, and keeps the id the field's
// aria-describedby points at.
describe("US-174: FieldError", () => {
  const html = renderToStaticMarkup(createElement(FieldError, { id: "invite-email-error", ...{ "data-testid": "invite-email-error" } }, "Enter a valid email address."));

  it("keeps the id and test id, and is a role=alert paragraph", () => {
    expect(html).toContain('id="invite-email-error"');
    expect(html).toContain('data-testid="invite-email-error"');
    expect(html).toContain('role="alert"');
    expect(html.startsWith("<p ")).toBe(true);
  });

  it("is danger-coloured, so its icon (currentColor) is too", () => {
    expect(html).toContain("text-danger");
  });

  it("carries a decorative icon beside the message text", () => {
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain("<span>Enter a valid email address.</span>");
  });
});
