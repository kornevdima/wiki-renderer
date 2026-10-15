"use client";

import { SaveIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RichTextEditorHandle } from "@/components/ui/rich-text-editor";
import { savePageAction, uploadImageAction } from "@/app/w/[wikiId]/[[...path]]/actions";
import { ASSET_API_PREFIX } from "@/content/links/asset-url";

import { editorMessages, toEditorText, wikiPathOfImage, type EditorCopy } from "./edit-text";

/**
 * The page editor (`?view=edit`, DEC-016 note 2026-10-16). The design system's RichTextEditor, loaded client-only, edits
 * the page's Markdown; Save (or ⌘S / Ctrl S) sends the editor's Markdown from before any edit and now, with the hash of
 * the file as it was opened, to `savePageAction`, which keeps every untouched block as written and refuses when the file
 * changed on disk. A page the editor can't read opens as plain source in a text area instead, saved the same way.
 * Leaving with unsaved changes asks first (the browser's own prompt).
 */
export interface EditCopy {
  editorLabel: string;
  sourceLabel: string;
  save: string;
  saving: string;
  saved: string;
  unsaved: string;
  loading: string;
  sourceOnly: string;
  conflict: string;
  reload: string;
  failed: string;
  readOnly: string;
  rewritten: string;
}

type Status = "idle" | "saving" | "saved" | "rewritten" | "conflict" | "failed" | "read_only";

const EditEditor = dynamic(() => import("./edit-editor"), { ssr: false });

export interface EditViewProps {
  wikiId: string;
  path: string;
  /** The file's text as the server read it, and the hash of exactly that text. */
  text: string;
  hash: string;
  copy: EditCopy;
  /** The toolbar's and dialogs' words. */
  editor: EditorCopy;
}

export function EditView({ wikiId, path, text, hash, copy, editor }: EditViewProps) {
  const router = useRouter();
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const baseHash = useRef(hash);
  const baseline = useRef<string | null>(null);
  const [mode, setMode] = useState<"rich" | "source">("rich");
  const [source, setSource] = useState(() => toEditorText(text));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [ready, setReady] = useState(false);

  const messages = useMemo(() => editorMessages(editor), [editor]);
  // A wiki image previews through the redirect to the asset route at the current snapshot (a save moves the sha on).
  const resolveImageSrc = useCallback(
    (src: string) => {
      const wikiPath = wikiPathOfImage(path, src);
      if (wikiPath === null) return src;
      const encoded = wikiPath.split("/").map(encodeURIComponent).join("/");
      return `${ASSET_API_PREFIX}/${encodeURIComponent(wikiId)}/latest-asset/${encoded}`;
    },
    [path, wikiId],
  );
  const onUploadImage = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.set("wikiId", wikiId);
      form.set("path", path);
      form.set("file", file);
      const result = await uploadImageAction(form);
      if (!result.ok) throw new Error(result.reason);
      return result.src;
    },
    [path, wikiId],
  );

  const onBaseline = useCallback((markdown: string) => {
    baseline.current ??= markdown;
    setReady(true);
  }, []);
  const onChange = useCallback((markdown: string) => {
    if (baseline.current !== null) setDirty(markdown !== baseline.current);
  }, []);
  // The editor couldn't read the page: edit the source as text, where the baseline is the text itself.
  const onError = useCallback(() => {
    baseline.current = toEditorText(text);
    setMode("source");
    setReady(true);
  }, [text]);

  const save = useCallback(async () => {
    if (status === "saving" || baseline.current === null) return;
    const edited = mode === "source" ? source : editorRef.current?.getMarkdown();
    if (edited === undefined) return;
    setStatus("saving");
    try {
      const result = await savePageAction({ wikiId, path, baseHash: baseHash.current, baseline: baseline.current, edited });
      if (!result.ok) {
        setStatus(result.reason === "conflict" ? "conflict" : result.reason === "read_only" ? "read_only" : "failed");
        return;
      }
      baseHash.current = result.hash;
      baseline.current = edited;
      setDirty(false);
      setStatus(result.preserved ? "saved" : "rewritten");
      router.refresh();
    } catch {
      setStatus("failed");
    }
  }, [mode, path, router, source, status, wikiId]);

  // ⌘S / Ctrl S saves instead of the browser's "Save page".
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const statusText =
    !ready ? copy.loading : status === "saving" ? copy.saving : status === "saved" ? copy.saved : dirty ? copy.unsaved : "";

  return (
    <div className="wr-edit flex flex-col gap-4" data-testid="edit-view">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void save()} disabled={!ready || status === "saving"} data-testid="edit-save">
          <SaveIcon aria-hidden="true" />
          {status === "saving" ? copy.saving : copy.save}
        </Button>
        <span role="status" aria-live="polite" className="text-caption text-ink-muted" data-testid="edit-status">
          {statusText}
        </span>
      </div>
      {status === "conflict" ? (
        <Alert variant="warning" data-testid="edit-conflict">
          <p>{copy.conflict}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
            {copy.reload}
          </Button>
        </Alert>
      ) : null}
      {status === "failed" ? <Alert variant="danger">{copy.failed}</Alert> : null}
      {status === "read_only" ? <Alert variant="info">{copy.readOnly}</Alert> : null}
      {status === "rewritten" ? <Alert variant="info">{copy.rewritten}</Alert> : null}
      {mode === "source" ? (
        <>
          <Alert variant="info" data-testid="edit-source-only">
            {copy.sourceOnly}
          </Alert>
          <textarea
            aria-label={copy.sourceLabel}
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setDirty(event.target.value !== baseline.current);
            }}
            spellCheck={false}
            className="min-h-[60vh] w-full rounded-(--ds-radius-md) border border-border wr-literal bg-surface p-4 font-mono text-body text-ink focus-visible:outline-(--focus-ring-width) focus-visible:outline-offset-(--focus-ring-offset) focus-visible:outline-focus-ring"
            data-testid="edit-source"
          />
        </>
      ) : (
        <EditEditor
          markdown={toEditorText(text)}
          ariaLabel={copy.editorLabel}
          editorRef={editorRef}
          onBaseline={onBaseline}
          onChange={onChange}
          onError={onError}
          messages={messages}
          onUploadImage={onUploadImage}
          resolveImageSrc={resolveImageSrc}
        />
      )}
    </div>
  );
}
