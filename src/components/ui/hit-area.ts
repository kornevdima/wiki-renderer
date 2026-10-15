export const HIT_AREA_COARSE_CLASS = [
  "[@media(pointer:coarse)]:[&:not(.absolute,.fixed,.sticky)]:relative",
  "[@media(pointer:coarse)]:after:absolute",
  "[@media(pointer:coarse)]:after:top-1/2",
  "[@media(pointer:coarse)]:after:left-1/2",
  "[@media(pointer:coarse)]:after:size-[max(100%,var(--hit-min))]",
  "[@media(pointer:coarse)]:after:-translate-1/2",
  "[@media(pointer:coarse)]:after:content-['']",
].join(" ")
/** On the control's `::before`, for a control that already draws with its `::after` (the underline Tabs' active line). */
export const HIT_AREA_COARSE_BEFORE_CLASS = [
  "[@media(pointer:coarse)]:[&:not(.absolute,.fixed,.sticky)]:relative",
  "[@media(pointer:coarse)]:before:absolute",
  "[@media(pointer:coarse)]:before:top-1/2",
  "[@media(pointer:coarse)]:before:left-1/2",
  "[@media(pointer:coarse)]:before:size-[max(100%,var(--hit-min))]",
  "[@media(pointer:coarse)]:before:-translate-1/2",
  "[@media(pointer:coarse)]:before:content-['']",
].join(" ")
