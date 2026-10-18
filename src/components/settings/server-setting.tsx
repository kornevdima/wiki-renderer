"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";

import { changeSettingsAction } from "@/app/settings/actions";
import { failureText } from "@/app/settings/failure-copy";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { TEXT_FIELD_HINT_CLASS, TextField } from "@/components/ui/text-field";
import { parsePortField } from "@/lib/port-field";

/**
 * The Server section's one control (US-278): the port the launcher uses, saved in `config.json`. Empty means the default
 * (4700, else the next free port). It applies the next time the app starts, so saving only writes the file.
 */
export function ServerSetting({ port }: { port: number | null }) {
  const t = useTranslations("settings");
  const headingId = useId();
  const [text, setText] = useState(port === null ? "" : String(port));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const value = parsePortField(text);
    if (value === undefined) {
      setError(t("errors.port_invalid"));
      return;
    }
    startTransition(async () => {
      const outcome = await changeSettingsAction({ kind: "port", value });
      if (outcome.ok) {
        setError(null);
        setSaved(true);
      } else {
        setError(failureText(t, outcome));
      }
    });
  };

  return (
    <section aria-labelledby={headingId} className="grid min-w-0 gap-4" data-testid="settings-server">
      <h2 id={headingId} className="m-0 text-base font-semibold">
        {t("server.heading")}
      </h2>
      {/* The hint and the error sit under the whole row from `sm` up (not squeezed into the field's column); below `sm` the order is field, hint, error, Save, as before. */}
      <form onSubmit={submit} noValidate className="grid items-start gap-3 sm:grid-cols-[minmax(0,10rem)_auto] sm:justify-start">
        <TextField
          id="settings-port"
          label={t("server.portLabel")}
          placeholder={t("server.portPlaceholder")}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSaved(false);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "settings-port-error-text settings-port-hint" : "settings-port-hint"}
          wrapperClassName="sm:col-start-1 sm:row-start-1"
          data-testid="settings-port"
        />
        <p id="settings-port-hint" className={`${TEXT_FIELD_HINT_CLASS} -mt-1 sm:col-span-2 sm:row-start-2`}>
          {t("server.portHint")}
        </p>
        {error ? (
          <FieldError id="settings-port-error-text" className="-mt-1 sm:col-span-2 sm:row-start-3">
            <span data-testid="settings-port-error">{error}</span>
          </FieldError>
        ) : null}
        <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="sm:col-start-2 sm:row-start-1 sm:mt-7 sm:justify-self-start" data-testid="settings-port-save">
          {pending ? t("server.saving") : t("server.save")}
        </Button>
      </form>
      <p role="status" aria-live="polite" className="m-0 min-h-5 text-small text-ink-secondary" data-testid="settings-port-status">
        {saved ? t("server.saved") : ""}
      </p>
    </section>
  );
}
