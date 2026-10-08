export type OutsideInteraction = "prevent" | "allow"

export function outsideInteractionDecision(state: { dirty: boolean }): OutsideInteraction {
  return state.dirty ? "prevent" : "allow"
}

/**
 * The role props for a dialog variant. Only the confirm variant sets a role; every other variant returns no `role` key at
 * all, because `role={undefined}` spread over Radix's own `role="dialog"` would remove it.
 */
export function dialogRoleProps(variant: "default" | "confirm"): { role?: "alertdialog" } {
  return variant === "confirm" ? { role: "alertdialog" } : {}
}
