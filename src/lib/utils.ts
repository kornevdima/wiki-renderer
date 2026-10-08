import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The ESG type scale as Tailwind font-size utilities (`text-title`, `text-small`, `text-label-large`, ...), generated into
 * esg-theme.css from tokens.json. tailwind-merge only knows Tailwind's stock sizes, so without this list it would read
 * `text-title` as a colour and keep a conflicting `text-sm` beside it. utils.test.ts keeps the list equal to the tokens.
 */
export const TYPE_SCALE = ["display-xl", "display-l", "statement", "heading-l", "heading-m", "heading-s", "title", "body", "body-strong", "small", "label-button", "label-large", "caption", "label", "label-form", "eyebrow", "display-xl-md", "display-xl-sm", "display-l-md", "display-l-sm", "statement-md", "statement-sm", "heading-l-md", "lead-md", "lead-sm"] as const;

const twMerge = extendTailwindMerge({ extend: { theme: { text: [...TYPE_SCALE] } } });

/**
 * Merge Tailwind class lists, letting a later conflicting utility win (e.g.
 * `cn("px-2", condition && "px-4")` keeps `px-4`, and `cn("text-sm", "text-title")` keeps `text-title`): the standard
 * shadcn/ui helper, extended with the ESG type scale.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
