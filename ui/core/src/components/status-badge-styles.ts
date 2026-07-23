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

/** Label + dot text color per status. */
export const STATUS_TEXT_CLASS: Record<StatusKind, string> = {
  active: "text-success",
  pending: "text-warning",
  error: "text-danger",
};
