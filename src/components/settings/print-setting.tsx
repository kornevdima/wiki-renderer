"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { changeSettingsAction } from "@/app/settings/actions";
import { Switch } from "@/components/ui/switch";

/**
 * The Print section's one control (US-277): "Print a heading made from the file name", saved as it changes. When
 * `WIKI_PRINT_FILE_TITLE` is set the switch shows that value, disabled, with a note.
 */
export function PrintSetting({ checked: initial, envManaged }: { checked: boolean; envManaged: boolean }) {
  const t = useTranslations("settings");
  const headingId = useId();
  const [checked, setChecked] = useState(initial);
  const [error, setError] = useState(false);
  const [, startTransition] = useTransition();

  const change = (value: boolean) => {
    const previous = checked;
    setChecked(value);
    setError(false);
    startTransition(async () => {
      const outcome = await changeSettingsAction({ kind: "printFileTitle", value });
      if (!outcome.ok) {
        setChecked(previous);
        setError(true);
      }
    });
  };

  return (
    <section aria-labelledby={headingId} className="grid min-w-0 gap-4" data-testid="settings-print">
      <h2 id={headingId} className="m-0 text-base font-semibold">
        {t("print.heading")}
      </h2>
      <Switch
        label={t("print.label")}
        hint={t("print.hint")}
        checked={checked}
        disabled={envManaged}
        onCheckedChange={change}
        showState
        data-testid="print-switch"
      />
      {envManaged ? (
        <p className="m-0 text-small text-ink-secondary" data-testid="print-env-note">
          {t("print.envNote")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-small text-danger" data-testid="print-error">
          {t("print.saveError")}
        </p>
      ) : null}
    </section>
  );
}
