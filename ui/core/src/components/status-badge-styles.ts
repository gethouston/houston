/**
 * Pure, JSX-free style maps for {@link StatusBadge} / {@link StatusDot}: one
 * status kind maps to one semantic color token. Kept in a `.ts` module so it is
 * importable by the package's `node --experimental-strip-types --test` runner
 * (which cannot load `.tsx`); the component re-uses the same maps.
 */

/** A connection / live-status kind. */
export type StatusKind = "active" | "pending" | "error";

/** Dot fill per status — the semantic status color tokens. */
export const STATUS_DOT_CLASS: Record<StatusKind, string> = {
  active: "bg-success",
  pending: "bg-warning",
  error: "bg-danger",
};

/**
 * Label colour per status — the `-ink` variant, never the fill. A status fill is
 * tuned to carry its own `-text` label on top of it; set as text on a surface it
 * measures 3.4:1 (green) and 2.1:1 (amber) in light, below the 4.5:1 body-text
 * floor. The inks are the same hues retuned for text, guarded in both themes by
 * `packages/design-tokens/test/contrast.test.ts`.
 */
export const STATUS_TEXT_CLASS: Record<StatusKind, string> = {
  active: "text-success-ink",
  pending: "text-warning-ink",
  error: "text-danger-ink",
};
