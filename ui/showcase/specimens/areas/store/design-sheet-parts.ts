import { storeType } from "@houston-ai/store";
import type { CSSProperties } from "react";

export interface TypeRole {
  name: string;
  spec: string;
  className: string;
  sample: string;
}

export const typeRoles: readonly TypeRole[] = [
  {
    name: "display",
    spec: "32 / 1.2 · 600 · tracking-tight",
    className: storeType.display,
    sample: "Agents that do the work",
  },
  {
    name: "section title",
    spec: "20 / 1.3 · 600 · tracking-tight",
    className: storeType.sectionTitle,
    sample: "Popular this week",
  },
  {
    name: "body",
    spec: "15 / 1.55 · 400",
    className: storeType.body,
    sample:
      "Every agent in the store is a real teammate you can hire in one click, and let go of just as easily.",
  },
  {
    name: "meta",
    spec: "13 / 1.4 · 400 · ink-muted",
    className: storeType.meta,
    sample: "Updated 2 days ago · 1,204 installs",
  },
];

export interface SpacingStep {
  /** The Tailwind utility the store spells this step with. */
  utility: string;
  px: number;
  use: string;
}

export const spacingSteps: readonly SpacingStep[] = [
  { utility: "gap-4", px: 16, use: "list row gap" },
  {
    utility: "gap-6 / p-6",
    px: 24,
    use: "card padding, grid gap, head to body",
  },
  { utility: "px-8", px: 32, use: "desktop page gutter" },
  { utility: "gap-10", px: 40, use: "between blocks (mobile)" },
  { utility: "pt-12", px: 48, use: "page top" },
  {
    utility: "gap-16 / pb-16",
    px: 64,
    use: "between blocks (desktop), run-out",
  },
];

export interface ColorRole {
  /** The `--ht-*` custom property this role resolves to at runtime. */
  token: string;
  utility: string;
  use: string;
}

export const surfaceRoles: readonly ColorRole[] = [
  {
    token: "--ht-base",
    utility: "bg-gutter",
    use: "the shared canvas (painted on the body, not the page)",
  },
  { token: "--ht-card", utility: "bg-card", use: "card / panel at rest" },
  {
    token: "--ht-card-hover",
    utility: "bg-card-hover",
    use: "card under the pointer",
  },
  {
    token: "--ht-chip-subtle",
    utility: "bg-chip-subtle",
    use: "recessed panel",
  },
  { token: "--ht-chip", utility: "bg-chip", use: "chips and badges" },
  { token: "--ht-line", utility: "border-line", use: "every hairline" },
];

export const inkRoles: readonly ColorRole[] = [
  { token: "--ht-ink", utility: "text-ink", use: "display, titles, body" },
  { token: "--ht-ink-muted", utility: "text-ink-muted", use: "meta, captions" },
  {
    token: "--ht-action",
    utility: "bg-action",
    use: "THE primary CTA, one per view",
  },
  {
    token: "--ht-focus",
    utility: "ring-focus",
    use: "focus ring (near-ink, not blue)",
  },
];

/**
 * Paints a swatch with the LIVE token rather than a copy of its value, so the
 * sheet can never drift from `packages/design-tokens` and re-themes instantly
 * when the toggle flips `data-theme`.
 */
export function colorSwatchStyle(token: string): CSSProperties {
  return { backgroundColor: `var(${token})` };
}
