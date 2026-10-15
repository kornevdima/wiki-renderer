"use client";

import { useEffect, useRef, type RefObject } from "react";

import { RichTextEditor, type RichTextEditorHandle } from "@/components/ui/rich-text-editor";
import type { RichTextMessages } from "@/components/ui/rich-text-messages";

/**
 * The editor as `EditView` loads it (`next/dynamic`, client only). Its one job beyond rendering: report the editor's
 * Markdown for the page before any edit (`onBaseline`), which the save's block-preserving merge needs, once the editor
 * has read the page.
 */
export interface EditEditorProps {
  markdown: string;
  ariaLabel: string;
  editorRef: RefObject<RichTextEditorHandle | null>;
  onBaseline: (markdown: string) => void;
  /** Every change, with the editor's Markdown (the initial normalisation can fire it too: compare with the baseline). */
  onChange: (markdown: string) => void;
  onError: () => void;
  messages: RichTextMessages;
  /** Uploads a picked image into the wiki's `assets/` folder and answers the address to write. */
  onUploadImage?: (file: File) => Promise<string>;
  /** A page's image address to a URL the browser can load. */
  resolveImageSrc: (src: string) => string;
}

export default function EditEditor({
  markdown,
  ariaLabel,
  editorRef,
  onBaseline,
  onChange,
  onError,
  messages,
  onUploadImage,
  resolveImageSrc,
}: EditEditorProps) {
  const reported = useRef(false);
  // Before MDXEditor is ready, `getMarkdown` answers the raw input, not the editor's own Markdown, which is what the merge
  // must compare against. Ready shows as rendered content, so wait a frame at a time until there is some.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      const editor = editorRef.current;
      if (reported.current) return;
      if (editor !== null && editor.getContentEditableHTML() !== "") {
        reported.current = true;
        onBaseline(editor.getMarkdown());
        return;
      }
      frame = requestAnimationFrame(check);
    };
    check();
    return () => cancelAnimationFrame(frame);
  }, [editorRef, onBaseline]);

  return (
    <RichTextEditor
      ref={editorRef}
      markdown={markdown}
      ariaLabel={ariaLabel}
      diffMarkdown={markdown}
      onChange={onChange}
      onError={onError}
      contentEditableClassName="wr-prose"
      messages={messages}
      onUploadImage={onUploadImage}
      resolveImageSrc={resolveImageSrc}
    />
  );
}
