"use client";

import { ChevronDownIcon, ChevronUpIcon, EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";

import { changeSettingsAction, type SettingsOutcome } from "@/app/settings/actions";
import { failureText } from "@/app/settings/failure-copy";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableActionsHead, TableBody, TableCell, TableEmptyCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import type { StoredWiki } from "@/content/runtime/user-config";

/**
 * The wiki list on the Settings page (US-277): an Add field above a table with one row per wiki: Name, Folder as written,
 * Up and Down, and a row menu with Rename and Remove. Read-only (no field, arrows or menu) when the environment manages
 * the list or the config file is bad. Every change is the one server action; the page re-renders from the file.
 */
export function SettingsWikis({ wikis, readOnly }: { wikis: readonly StoredWiki[]; readOnly: boolean }) {
  const t = useTranslations("settings");
  const headingId = useId();
  const [pending, startTransition] = useTransition();
  // A dialog opened from the row menu stays mounted after it closes (`open` goes false): unmounting it while open leaves
  // Radix's `pointer-events: none` on the body, and the page stops answering clicks.
  const [renaming, setRenaming] = useState<{ wiki: StoredWiki; open: boolean; seq: number } | null>(null);
  const [removing, setRemoving] = useState<{ wiki: StoredWiki; open: boolean; seq: number } | null>(null);
  // Where focus goes when a dialog closes: the row menu of this wiki id, or "" for the add field. Radix would drop it on
  // <body> (the menu item that opened the dialog is gone), and the DS's own return is skipped when this handler prevents it.
  const focusId = useRef<string | null>(null);
  const returnFocus = (event: Event) => {
    event.preventDefault();
    const id = focusId.current;
    const menu =
      id === null || id === ""
        ? null
        : Array.from(document.querySelectorAll<HTMLElement>('[data-testid="wiki-row"]'))
            .find((row) => row.dataset.wikiId === id)
            ?.querySelector<HTMLElement>('[data-testid="wiki-menu"]');
    (menu ?? document.getElementById("settings-add-folder"))?.focus();
  };
  /** After a confirmed remove: the next row's menu, else the previous one's, else the add field. */
  const neighbour = (id: string): string => {
    const at = wikis.findIndex((w) => w.id === id);
    return wikis[at + 1]?.id ?? wikis[at - 1]?.id ?? "";
  };

  const [moveError, setMoveError] = useState<string | null>(null);
  const move = (id: string, direction: "up" | "down") => {
    startTransition(async () => {
      const outcome = await changeSettingsAction({ kind: "move", id, direction });
      setMoveError(outcome.ok ? null : failureText(t, outcome));
    });
  };

  return (
    <section aria-labelledby={headingId} className="grid min-w-0 gap-4" data-testid="settings-wikis">
      <h2 id={headingId} className="m-0 text-base font-semibold">
        {t("wikis.heading")}
      </h2>
      {readOnly ? null : <AddForm />}
      <Table regionLabelledBy={headingId} className="table-fixed sm:table-auto" data-testid="settings-table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("wikis.colName")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("wikis.colFolder")}</TableHead>
            {readOnly ? null : <TableActionsHead className="w-16 sm:w-auto">{t("wikis.colActions")}</TableActionsHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {wikis.length === 0 ? (
            <TableRow>
              {/* One cell per breakpoint, each spanning the columns visible there (Folder is hidden below `sm`). */}
              <TableEmptyCell colSpan={readOnly ? 1 : 2} className="p-4 sm:hidden">
                {t("wikis.empty")}
              </TableEmptyCell>
              <TableEmptyCell colSpan={readOnly ? 2 : 3} className="hidden p-4 sm:table-cell">
                {t("wikis.empty")}
              </TableEmptyCell>
            </TableRow>
          ) : null}
          {wikis.map((wiki, index) => (
            <TableRow key={wiki.id} data-testid="wiki-row" data-wiki-id={wiki.id}>
              <TableRowHead className="[overflow-wrap:anywhere]">
                {wiki.name}
                <span className="mt-1 block max-w-full truncate text-[13px] font-normal text-muted-foreground sm:hidden" title={wiki.root}>
                  <span className="wr-literal">{wiki.root}</span>
                </span>
              </TableRowHead>
              <TableCell className="hidden sm:table-cell">
                <span className="block max-w-48 truncate md:max-w-md" title={wiki.root} data-testid="wiki-folder">
                  <span className="wr-literal">{wiki.root}</span>
                </span>
              </TableCell>
              {readOnly ? null : (
                <TableCell actions>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("wikis.moveUp", { name: wiki.name })}
                      disabled={index === 0 || pending}
                      className="hidden sm:inline-flex"
                      onClick={() => move(wiki.id, "up")}
                      data-testid="wiki-up"
                    >
                      <ChevronUpIcon aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("wikis.moveDown", { name: wiki.name })}
                      disabled={index === wikis.length - 1 || pending}
                      className="hidden sm:inline-flex"
                      onClick={() => move(wiki.id, "down")}
                      data-testid="wiki-down"
                    >
                      <ChevronDownIcon aria-hidden="true" />
                    </Button>
                    {/* Not modal: a modal menu that hands over to a dialog leaves `pointer-events: none` on the body (Radix) and the page stops answering. */}
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={t("wikis.rowMenu", { name: wiki.name })} data-testid="wiki-menu">
                          <EllipsisIcon aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {/* Below `sm` the arrows live in the menu, so the name and the menu stay on a phone's screen (BUG-052's rule). */}
                        <DropdownMenuItem className="sm:hidden" disabled={index === 0 || pending} onSelect={() => move(wiki.id, "up")} data-testid="wiki-move-up">
                          <ChevronUpIcon aria-hidden="true" />
                          {t("wikis.moveUp", { name: wiki.name })}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="sm:hidden" disabled={index === wikis.length - 1 || pending} onSelect={() => move(wiki.id, "down")} data-testid="wiki-move-down">
                          <ChevronDownIcon aria-hidden="true" />
                          {t("wikis.moveDown", { name: wiki.name })}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => {
                            focusId.current = wiki.id;
                            setRenaming({ wiki, open: true, seq: (renaming?.seq ?? 0) + 1 });
                          }} data-testid="wiki-rename">
                          <PencilIcon aria-hidden="true" />
                          {t("wikis.rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => {
                            focusId.current = wiki.id;
                            setRemoving({ wiki, open: true, seq: (removing?.seq ?? 0) + 1 });
                          }} data-testid="wiki-remove">
                          <Trash2Icon aria-hidden="true" />
                          {t("wikis.remove")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {moveError ? (
        <p role="alert" className="m-0 text-small text-danger" data-testid="settings-move-error">
          {moveError}
        </p>
      ) : null}
      {renaming ? (
        <RenameDialog onCloseAutoFocus={returnFocus} key={`${renaming.wiki.id}-${renaming.seq}`} wiki={renaming.wiki} open={renaming.open} onClose={() => setRenaming({ ...renaming, open: false })} />
      ) : null}
      {removing ? (
        <RemoveDialog onCloseAutoFocus={returnFocus} onRemoved={() => (focusId.current = neighbour(removing.wiki.id))} key={`${removing.wiki.id}-${removing.seq}`} wiki={removing.wiki} open={removing.open} onClose={() => setRemoving({ ...removing, open: false })} />
      ) : null}
    </section>
  );
}

function AddForm() {
  const t = useTranslations("settings");
  const [folder, setFolder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const outcome: SettingsOutcome = await changeSettingsAction({ kind: "add", folder });
      if (outcome.ok) {
        setFolder("");
        setError(null);
      } else {
        setError(failureText(t, outcome));
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" data-testid="settings-add">
      <TextField
        id="settings-add-folder"
        label={t("wikis.addLabel")}
        hint={t("wikis.addHint")}
        placeholder={t("wikis.addPlaceholder")}
        value={folder}
        onChange={(event) => {
          setFolder(event.target.value);
          if (error) setError(null);
        }}
        error={error ? <span data-testid="settings-add-error">{error}</span> : undefined}
        autoComplete="off"
        spellCheck={false}
        data-testid="settings-add-input"
      />
      <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="sm:mt-7" data-testid="settings-add-button">
        {pending ? t("wikis.adding") : t("wikis.addButton")}
      </Button>
    </form>
  );
}

function RenameDialog({ wiki, open, onClose, onCloseAutoFocus }: { wiki: StoredWiki; open: boolean; onClose: () => void; onCloseAutoFocus: (event: Event) => void }) {
  const t = useTranslations("settings");
  const [name, setName] = useState(wiki.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const outcome = await changeSettingsAction({ kind: "rename", id: wiki.id, name });
      if (outcome.ok) onClose();
      else setError(failureText(t, outcome));
    });
  };

  return (
    <Dialog open={open} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} closeLabel={t("close")} aria-describedby={undefined} data-testid="rename-dialog">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{t("rename.title")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <TextField
              label={t("rename.label")}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              error={error ? <span data-testid="rename-error">{error}</span> : undefined}
              autoComplete="off"
              data-testid="rename-input"
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="rename-cancel">
              {t("rename.cancel")}
            </Button>
            <Button type="submit" disabled={pending} data-testid="rename-save">
              {t("rename.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ wiki, open, onClose, onCloseAutoFocus, onRemoved }: { wiki: StoredWiki; open: boolean; onClose: () => void; onCloseAutoFocus: (event: Event) => void; onRemoved: () => void }) {
  const t = useTranslations("settings");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const outcome = await changeSettingsAction({ kind: "remove", id: wiki.id });
      if (outcome.ok) {
        onRemoved();
        onClose();
      } else setError(failureText(t, outcome));
    });
  };

  return (
    <Dialog open={open} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent variant="confirm" onCloseAutoFocus={onCloseAutoFocus} closeLabel={t("close")} data-testid="remove-dialog">
        <DialogHeader>
          <DialogTitle>{t("removeDialog.title", { name: wiki.name })}</DialogTitle>
          <DialogDescription>{t("removeDialog.text", { name: wiki.name })}</DialogDescription>
        </DialogHeader>
        {error ? (
          <DialogBody>
            <p role="alert" className="m-0 text-small text-danger" data-testid="remove-error">
              {error}
            </p>
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} data-testid="remove-cancel">
            {t("removeDialog.cancel")}
          </Button>
          <Button type="button" variant="danger" disabled={pending} onClick={confirm} data-testid="remove-confirm">
            {t("removeDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
