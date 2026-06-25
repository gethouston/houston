/**
 * RowCardButton — the standard pill action for a `RowCard`. A black
 * (`default`) or hairline (`outline`) rounded pill, matching the Composio /
 * integration sign-in button.
 *
 * `icon` is OPTIONAL and that is deliberate: the refactor strips decorative
 * glyphs out of these buttons (no key on "Reconnect", no logo on "Sign in
 * with Claude"), so the resting button is text-only. The one card that still
 * wants a glyph — the Composio sign-in card — passes its trailing "open in
 * browser" link icon via `icon` + `iconPosition="trailing"`.
 *
 * Built on the shared `AsyncButton` (HOU-465): when `onClick` returns a
 * promise the button disables itself for the duration, so rage clicks can't
 * fire the action twice. Return the promise from async handlers (don't
 * `void` it) to engage that guard. `loading` forces the pending look for
 * pending state that lives OUTSIDE the click (e.g. the Composio card's
 * external auth watcher); AsyncButton's own spinner is off so the spinner
 * placement stays consistent with the rest of the pill.
 */

import { AsyncButton } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface RowCardButtonProps {
  label: ReactNode;
  /**
   * Return the promise from async work to get the rage-click guard; a
   * synchronous handler can just return nothing. Typed `unknown` (not
   * `void | Promise`) so a fire-and-forget sync action and async work share
   * one prop without tripping Biome's confusing-void-union rule.
   */
  onClick: () => unknown;
  icon?: ReactNode;
  iconPosition?: "leading" | "trailing";
  loading?: boolean;
  disabled?: boolean;
  variant?: "default" | "outline";
}

export function RowCardButton({
  label,
  onClick,
  icon,
  iconPosition = "leading",
  loading = false,
  disabled = false,
  variant = "default",
}: RowCardButtonProps) {
  return (
    <AsyncButton
      type="button"
      variant={variant === "outline" ? "outline" : "default"}
      size="sm"
      spinner={false}
      disabled={disabled || loading}
      // AsyncButton wants `undefined | Promise<unknown>`; normalize a
      // synchronous (void) handler to `undefined` while still handing the
      // promise back from async work so the rage-click guard engages.
      onClick={() => {
        const result: unknown = onClick();
        return result instanceof Promise ? result : undefined;
      }}
      className="h-7 gap-1 rounded-full px-2.5 text-xs font-medium"
    >
      {loading ? (
        <Loader2 className="size-3 animate-spin" />
      ) : iconPosition === "leading" ? (
        icon
      ) : null}
      {label}
      {!loading && iconPosition === "trailing" ? icon : null}
    </AsyncButton>
  );
}
