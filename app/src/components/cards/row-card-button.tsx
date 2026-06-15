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
 * `loading` swaps the leading slot for a spinner; the caller owns the state.
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface RowCardButtonProps {
  label: ReactNode;
  onClick: () => void;
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
  const variantClass =
    variant === "outline"
      ? "border border-border bg-transparent text-foreground hover:bg-black/[0.05]"
      : "border border-border bg-foreground text-background hover:opacity-90";

  const spinner = <Loader2 className="size-3 animate-spin" />;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-opacity duration-200 disabled:opacity-50 ${variantClass}`}
    >
      {loading ? spinner : iconPosition === "leading" ? icon : null}
      {label}
      {!loading && iconPosition === "trailing" ? icon : null}
    </button>
  );
}
