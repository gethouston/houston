/**
 * Pure, JSX-free style maps for {@link TriggerStatusBadge}: one badge state maps
 * to one label colour and one dot fill. Kept in a `.ts` module so the package's
 * `node --experimental-strip-types --test` runner (which cannot load `.tsx`) can
 * pin them; the component re-uses the same maps.
 */
import type { TriggerBadgeState } from "./trigger-status-view";

/**
 * Label colour per state — the `-ink` variant of the hue, never the fill. A
 * status fill is tuned to carry its own `-text` label on top of it; set as text
 * on a surface it measures 3.4:1 (green) and 2.1:1 (amber) in light, below the
 * 4.5:1 body-text floor. The inks are the same hues retuned for text, guarded in
 * both themes by `packages/design-tokens/test/contrast.test.ts`.
 */
export const TRIGGER_TONE_CLASS: Record<TriggerBadgeState, string> = {
  active: "text-success-ink",
  pending: "text-ink-muted",
  paused_disconnected: "text-warning-ink",
  paused_revoked: "text-warning-ink",
  error: "text-danger-ink",
  unknown: "text-ink-muted",
};

/** Dot fill per state — here the hue IS a fill, so it stays the fill token. */
export const TRIGGER_DOT_CLASS: Record<TriggerBadgeState, string> = {
  active: "bg-success",
  pending: "bg-ink-muted",
  paused_disconnected: "bg-warning",
  paused_revoked: "bg-warning",
  error: "bg-danger",
  // A hollow, pulsing ring — visibly "checking", never a healthy fill.
  unknown: "border border-ink-muted animate-pulse",
};
