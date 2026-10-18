"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useFormReset } from "@/components/ui/use-form-reset"

/**
 * The ESG Switch (project/components/Switch): one on/off setting that applies immediately. The track is
 * `switch-w` × `switch-h` (40×24), `radius-pill`; off is the solid `switch-off` grey, on is `primary`. The knob is white in
 * both states (`switch-knob` off, `on-primary` on; knob contrast ruled 2026-10-02) and slides over `duration-fast` with
 * `ease-standard`, never under reduced motion. Hover takes the off border to `border-hover` (it stays `primary` when on).
 * Focus is the global solid outline, offset 2px. Disabled dims the control only, to `opacity-disabled` (owner request
 * 2026-10-14: the label, hint and state word keep their full ink, so they keep 4.5:1; a dimmed row failed axe on the "Off" word),
 * with a not-allowed cursor on the row.
 *
 * A native `button role="switch"` with `aria-checked`, not Radix Switch: Radix writes a hidden form-bubble input with an inline
 * `style` into server HTML (it cannot tell it is outside a form), which a strict `style-src` refuses. The native button toggles on
 * Space and Enter by itself. With a `name` the Switch posts like a checkbox through a visually hidden checkbox input (class
 * `sr-only`, no inline style): `value` ("on" by default) when on, nothing when off. The control is named by the visible
 * label through `aria-labelledby` (the label is also a click target). The optional state word ("On" / "Off", `caption`,
 * `ink-secondary`) is `aria-hidden`, because `aria-checked` already announces the state, so the meaning never rests on
 * colour alone. Don't put a Switch in a form with a Save button (use Checkbox).
 */
const ROW_CLASS =
  "group/switch inline-flex cursor-pointer items-center gap-3 text-small text-foreground has-disabled:cursor-not-allowed has-aria-disabled:cursor-not-allowed"
const ROW_BLOCK_CLASS = "flex w-full justify-between"
const CONTROL_CLASS =
  "peer inline-flex h-(--switch-h) w-(--switch-w) shrink-0 cursor-[inherit] items-center rounded-(--ds-radius-pill) border border-switch-off bg-switch-off p-0 transition-[background-color,border-color] duration-(--duration-fast) ease-standard data-[state=unchecked]:group-hover/switch:border-foreground data-[state=unchecked]:hover:border-foreground data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-(--opacity-disabled) aria-disabled:opacity-(--opacity-disabled) motion-reduce:transition-none"
const THUMB_CLASS =
  "pointer-events-none block size-[calc(var(--switch-h)-8px)] translate-x-[3px] rounded-(--ds-radius-round) bg-switch-knob transition-[transform,background-color] duration-(--duration-fast) ease-standard data-[state=checked]:translate-x-[calc(var(--switch-w)-var(--switch-h)+3px)] data-[state=checked]:bg-on-primary motion-reduce:transition-none"
const HINT_CLASS = "text-caption text-ink-secondary"
const STATE_CLASS = "min-w-[3ch] text-caption text-ink-secondary"

type SwitchProps = Omit<React.ComponentProps<"button">, "type" | "role" | "value" | "defaultValue" | "onChange" | "checked" | "defaultChecked"> & {
  /** Controlled: whether the setting is on. */
  checked?: boolean
  /** Uncontrolled: whether it starts on. */
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  /** Posts the setting with a form (see above); without a name nothing is posted. */
  name?: string
  /** What an on Switch posts; "on" by default, as a checkbox does. */
  value?: string
  /** The form's id, when the Switch sits outside the form it belongs to. */
  form?: string
  /** A form must have it on before it submits. */
  required?: boolean
  /** The setting, phrased as the setting ("Weekly report"), never as an action. It does not change with the state. */
  label?: React.ReactNode
  /** A one-line hint under the label (`caption`, `ink-secondary`). */
  hint?: React.ReactNode
  /** Spread the label and control across a full-width settings row. */
  block?: boolean
  /** Show the state word after the control. */
  showState?: boolean
  /** The state words; the spec's copy is "On" / "Off". */
  onLabel?: string
  offLabel?: string
  /** Classes for the row (the control takes `className`). */
  wrapperClassName?: string
}

function Switch({
  id: idProp,
  label,
  hint,
  block = false,
  showState = false,
  onLabel = "On",
  offLabel = "Off",
  className,
  wrapperClassName,
  checked,
  defaultChecked,
  onCheckedChange,
  name,
  value = "on",
  form,
  required,
  disabled,
  onClick,
  ref: refProp,
  "aria-describedby": describedByProp,
  "aria-labelledby": labelledByProp,
  ...props
}: SwitchProps) {
  const autoId = React.useId()
  const id = idProp ?? autoId
  const [inner, setInner] = React.useState(Boolean(defaultChecked))
  const on = checked ?? inner
  const state = on ? "checked" : "unchecked"
  const initial = React.useRef(Boolean(defaultChecked))
  const formRef = useFormReset(form, checked === undefined, () => setInner(initial.current), refProp)
  const ariaDisabled = props["aria-disabled"] === true || props["aria-disabled"] === "true"

  const control = (
    <>
      <button
        ref={formRef}
        type="button"
        role="switch"
        id={id}
        data-slot="switch"
        data-state={state}
        data-disabled={disabled ? "" : undefined}
        aria-checked={on}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event)
          if (event.defaultPrevented || disabled || ariaDisabled) return
          if (checked === undefined) setInner(!on)
          onCheckedChange?.(!on)
        }}
        aria-labelledby={label ? `${id}-label` : labelledByProp}
        aria-describedby={[describedByProp, hint ? `${id}-hint` : undefined].filter(Boolean).join(" ") || undefined}
        className={cn(CONTROL_CLASS, className)}
        {...props}
      >
        <span data-slot="switch-thumb" data-state={state} className={THUMB_CLASS} />
      </button>
      {name ? (
        <input
          type="checkbox"
          data-slot="switch-input"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          name={name}
          value={value}
          form={form}
          required={required}
          disabled={disabled}
          checked={on}
          readOnly
        />
      ) : null}
    </>
  )
  if (!label && !showState) return control

  return (
    <div data-slot="switch-row" data-block={block ? "true" : undefined} className={cn(ROW_CLASS, block && ROW_BLOCK_CLASS, wrapperClassName)}>
      {label ? (
        <span data-slot="switch-label" className="grid min-w-0">
          <label id={`${id}-label`} htmlFor={id} className="cursor-[inherit]">
            {label}
          </label>
          {hint ? (
            <span id={`${id}-hint`} className={HINT_CLASS}>
              {hint}
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-3">
        {control}
        {showState ? (
          <span data-slot="switch-state" aria-hidden="true" className={STATE_CLASS}>
            {on ? onLabel : offLabel}
          </span>
        ) : null}
      </span>
    </div>
  )
}

export { Switch, ROW_CLASS, CONTROL_CLASS, THUMB_CLASS, STATE_CLASS }
export type { SwitchProps }
