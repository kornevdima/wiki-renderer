import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Required and optional field marking (brand book, Forms; ruled 2026-10-08): **mark the rarer kind**.
 * - Every required field carries the `required` attribute, always (assistive technology announces it; the browser blocks an
 *   empty submit).
 * - Visibly, a form marks whichever kind is rarer: mostly required fields → the optional ones say "(optional)"; mostly
 *   optional → the required ones say "(required)". On a tie, mark the optional ones. Never a bare `*`, never colour alone.
 * - The marker is part of the label text, after it, in `ink-secondary` at regular weight (`esg-field__marker`).
 * No "use client": the helpers and the marker are safe in server components.
 */
export type FieldMarkerKind = "optional" | "required"

export const FIELD_MARKER_CLASS = "font-normal text-ink-secondary"
/** English defaults; apps pass their translation (`markerLabels`), as US-224 did for Close. */
export const FIELD_MARKER_DEFAULT_LABELS: Record<FieldMarkerKind, string> = { optional: "optional", required: "required" }

/** Which kind a form marks: the rarer one; optional on a tie (and for an empty form). */
export function fieldMarkerKind(fields: ReadonlyArray<{ required?: boolean }>): FieldMarkerKind {
  const required = fields.filter((field) => field.required).length
  return required >= fields.length - required ? "optional" : "required"
}

/** The marker one field shows in a form that marks `kind`: only the fields of that kind are marked. */
export function fieldMarkerFor(required: boolean, kind: FieldMarkerKind): FieldMarkerKind | undefined {
  return (kind === "required") === required ? kind : undefined
}

/** " (optional)" / " (required)" after the label text: `ink-secondary`, regular weight. */
function FieldMarker({
  kind,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { kind: FieldMarkerKind; label?: string }) {
  return (
    <span data-slot="field-marker" data-kind={kind} className={cn(FIELD_MARKER_CLASS, className)} {...props}>
      {` (${label ?? FIELD_MARKER_DEFAULT_LABELS[kind]})`}
    </span>
  )
}

/** The `required` a field gets from its marker: a field marked "(required)" is required unless the caller says otherwise. */
export function requiredFromMarker(marker: FieldMarkerKind | undefined, required: boolean | undefined): boolean | undefined {
  return required ?? (marker === "required" ? true : undefined)
}

/**
 * Owner ruling 2026-10-08: a "(required)" marker on a field that has the `required` attribute is `aria-hidden`, so a screen
 * reader hears "required" once, from the attribute. "(optional)" stays readable (no attribute says it), and so does a
 * "(required)" on a group without the attribute (a CheckboxGroup's fieldset).
 */
export function markerAriaHidden(marker: FieldMarkerKind | undefined, required: boolean | undefined): true | undefined {
  return marker === "required" && required === true ? true : undefined
}

export { FieldMarker }
