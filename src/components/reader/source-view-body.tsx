/**
 * The source view's body (US-161, D1; TC-494): the file's text as React text inside `<pre><code>`, so React escapes it.
 * No Markdown parse, no Shiki, no `dangerouslySetInnerHTML`: a hostile page is only ever characters here.
 */
export function SourceView({ text }: { text: string }) {
  // The inline ligature rule is deliberately redundant with the esg-theme.css base rule on pre/code; US-161 pins it.
  return (
    <pre data-testid="source-view" className="wr-source whitespace-pre-wrap break-words [font-variant-ligatures:none] [font-feature-settings:'liga'_0,'calt'_0]">
      <code>{text}</code>
    </pre>
  );
}
