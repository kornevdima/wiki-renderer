"use client";

import { CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { COPIED_REVERT_MS, copyText } from "./copy-source-state";

/**
 * "Copy" for the source view (US-161, FR-047; contract D3). `text` is the exact decoded string the server passed, never
 * the DOM's `textContent`, so a `\r\n` source survives. On success the control shows "Copied" in a polite live region
 * next to the unchanged "Copy" button and reverts after `COPIED_REVERT_MS`; on failure it stays "Copy" with no error UI.
 */
export interface CopySourceCopy {
  copy: string;
  label: string;
  copied: string;
}

export function CopySourceButton({ text, copy }: { text: string; copy: CopySourceCopy }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async () => {
    const ok = await copyText(text, typeof navigator === "undefined" ? undefined : navigator.clipboard);
    if (!ok) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_REVERT_MS);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2 print:hidden" data-testid="source-copy">
      <Button type="button" variant="outline" size="sm" aria-label={copy.label} onClick={() => void onClick()}>
        <CopyIcon aria-hidden="true" />
        {copy.copy}
      </Button>
      <span role="status" aria-live="polite" data-testid="source-copy-status" className="text-xs text-success empty:hidden">
        {copied ? copy.copied : null}
      </span>
    </span>
  );
}
