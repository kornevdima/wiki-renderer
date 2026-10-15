"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldMarker, markerAriaHidden, requiredFromMarker, type FieldMarkerKind } from "@/components/ui/field-marker"

/**
 * US-223: the ESG TextField (project/components/TextField) for admin forms: the admin label (`label-form`, 14/20 bold, `ink`)
 * above an Input, a hint (`caption`, `ink-muted`) and an error (FieldError: `small`, `danger`, with its icon) below. The
 * wiring is done once here: the input is named by its `<label for>`, `aria-describedby` lists the error and the hint (in that
 * order, so the instruction is read first), and `aria-invalid` is set while an error shows.
 *
 * States come from Input, which is the spec's box: `border-strong` at rest, `border-hover` (ink) on hover, the global focus
 * outline (US-200), `danger` border when invalid, and disabled (`opacity-disabled`, `surface-muted`, `border`); the label dims
 * with a disabled field. Sizes: `default` is the 48px field for dialogs and pages (`control-h-s`, `body`); `sm` is the 40px
 * field for toolbars and app chrome (`control-h-m`, `small`), which needs `min-height` and `padding-block: 0` (the repo gotcha).
 *
 * Suffix (2026-10-10, the spec's `esg-field__suffix`): a short unit inside the box after the value ("%", "days"). The box
 * then moves to a wrapper (border, fill, radius, hover, invalid, disabled and the focus outline, drawn while the input has
 * keyboard focus) and the input inside it is borderless, so the suffix takes its own width and the text never runs under
 * it. The suffix is `ink-secondary` in the input's type size, not focusable, not part of the value, and `aria-hidden`: the
 * input reads it once through `aria-describedby`.
 */
type TextFieldSize = "default" | "sm"

const TEXT_FIELD_INPUT_SIZE: Record<TextFieldSize, string> = {
  default: "h-(--control-h-s) min-h-(--control-h-s) text-body md:text-body",
  sm: "h-(--control-h-m) min-h-(--control-h-m) py-0 text-small md:text-small",
}
const TEXT_FIELD_HINT_CLASS = "text-caption text-ink-muted"
const TEXT_FIELD_LABEL_CLASS = "text-label-form text-ink group-data-[disabled=true]:opacity-(--opacity-disabled)"

/** The box when a suffix is shown: Input's border, fill and states on the wrapper, with the focus outline while the input has keyboard focus. */
const TEXT_FIELD_BOX_CLASS =
  "flex w-full min-w-0 items-center rounded-lg border border-border-strong bg-background transition-[border-color,background-color] duration-(--duration-base) ease-(--ease-base) not-has-aria-invalid:hover:border-foreground has-aria-invalid:border-danger has-disabled:cursor-not-allowed has-disabled:border-border has-disabled:bg-muted has-disabled:opacity-(--opacity-disabled) has-focus-visible:outline-solid motion-reduce:transition-none"
const TEXT_FIELD_BOX_SIZE: Record<TextFieldSize, string> = {
  default: "h-(--control-h-s) min-h-(--control-h-s)",
  sm: "h-(--control-h-m) min-h-(--control-h-m)",
}
/** The input inside the box: borderless and transparent, the box's full height, with a `space-8` gap before the suffix. */
const TEXT_FIELD_BOXED_INPUT_CLASS =
  "h-full min-h-0 flex-1 rounded-none border-0 bg-transparent pe-2 focus-visible:outline-transparent disabled:bg-transparent disabled:opacity-100"
/** The unit: `ink-secondary`, the input's type size, `space-16` from the right edge; not focusable or selectable. */
const TEXT_FIELD_SUFFIX_CLASS: Record<TextFieldSize, string> = {
  default: "pointer-events-none shrink-0 pe-4 text-body whitespace-nowrap text-ink-secondary select-none",
  sm: "pointer-events-none shrink-0 pe-4 text-small whitespace-nowrap text-ink-secondary select-none",
}

/** The ids an `aria-describedby` lists, skipping the parts that are not rendered. */
function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const list = ids.filter(Boolean) as string[]
  return list.length ? list.join(" ") : undefined
}

type TextFieldProps = Omit<React.ComponentProps<"input">, "size"> & {
  /** The visible label. Required: the placeholder is never the label. Mark the rarer kind with `marker`, not in this text. */
  label: React.ReactNode
  /**
   * "(optional)" or "(required)" after the label (ruled 2026-10-08: mark the rarer kind in the form; `fieldMarkerKind`
   * decides which). "required" also sets the `required` attribute unless you pass `required` yourself.
   */
  marker?: FieldMarkerKind
  /** The marker words in the app's language; English "optional" / "required" by default. */
  markerLabels?: Partial<Record<FieldMarkerKind, string>>
  /** A hint under the input (`caption`, `ink-muted`); it stays while an error shows. */
  hint?: React.ReactNode
  /** The error instruction ("Enter a full phone number"); sets `aria-invalid` and is linked by `aria-describedby`. */
  error?: React.ReactNode
  size?: TextFieldSize
  /**
   * A short unit inside the box after the value ("%", "days"; 2026-10-10). Not part of the value; the input reads it
   * through `aria-describedby`. Pass the words in the app's language; for a symbol a screen reader may misread, pass
   * `<><span aria-hidden="true">%</span><span className="sr-only">percent</span></>`.
   */
  suffix?: React.ReactNode
  /** Classes for the field wrapper (the input itself takes `className`). */
  wrapperClassName?: string
}

function TextField({
  id: idProp,
  label,
  hint,
  error,
  size = "default",
  suffix,
  className,
  wrapperClassName,
  disabled,
  marker,
  markerLabels,
  required,
  "aria-describedby": describedByProp,
  ...props
}: TextFieldProps) {
  const autoId = React.useId()
  const id = idProp ?? autoId
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const hasSuffix = suffix !== undefined && suffix !== null && suffix !== false && suffix !== ""
  const suffixId = hasSuffix ? `${id}-suffix` : undefined
  const invalid = Boolean(error) || props["aria-invalid"] === true || props["aria-invalid"] === "true"

  const input = (inputClassName: string) => (
    <Input
      id={id}
      disabled={disabled}
      required={requiredFromMarker(marker, required)}
      {...props}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(describedByProp, suffixId, errorId, hintId)}
      className={inputClassName}
    />
  )

  return (
    <div
      data-slot="textfield"
      data-size={size}
      data-disabled={disabled ? "true" : undefined}
      className={cn("group grid min-w-0 gap-2", wrapperClassName)}
    >
      <Label htmlFor={id} className={TEXT_FIELD_LABEL_CLASS}>
        {label}
        {marker ? (
          <FieldMarker kind={marker} label={markerLabels?.[marker]} aria-hidden={markerAriaHidden(marker, requiredFromMarker(marker, required))} />
        ) : null}
      </Label>
      {hasSuffix ? (
        <div data-slot="textfield-box" className={cn(TEXT_FIELD_BOX_CLASS, TEXT_FIELD_BOX_SIZE[size])}>
          {input(cn(TEXT_FIELD_INPUT_SIZE[size], TEXT_FIELD_BOXED_INPUT_CLASS, className))}
          <span id={suffixId} aria-hidden="true" data-slot="textfield-suffix" className={TEXT_FIELD_SUFFIX_CLASS[size]}>
            {suffix}
          </span>
        </div>
      ) : (
        input(cn(TEXT_FIELD_INPUT_SIZE[size], className))
      )}
      {hintId ? (
        <p id={hintId} data-slot="textfield-hint" className={TEXT_FIELD_HINT_CLASS}>
          {hint}
        </p>
      ) : null}
      {errorId ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  )
}

export {
  TextField,
  TEXT_FIELD_INPUT_SIZE,
  TEXT_FIELD_HINT_CLASS,
  TEXT_FIELD_LABEL_CLASS,
  TEXT_FIELD_BOX_CLASS,
  TEXT_FIELD_BOX_SIZE,
  TEXT_FIELD_BOXED_INPUT_CLASS,
  TEXT_FIELD_SUFFIX_CLASS,
}
export type { TextFieldProps, TextFieldSize }
