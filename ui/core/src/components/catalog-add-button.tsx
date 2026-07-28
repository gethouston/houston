"use client";

import { Plus } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../utils";
import { Spinner } from "./spinner";

/** A catalog row's install affordance: a GHOST round button carrying a full-ink
 *  `+` — transparent at rest so the icon itself is the accent, and on hover the
 *  circle fills with the elevated `input` surface (white in light mode), which
 *  pops against the row's own `hover` wash. `label` is the accessible name (the
 *  icon says nothing); `busy` swaps the plus for a spinner at full strength
 *  while THIS item installs (a disabled-but-busy button must not fade like a
 *  blocked one).
 *
 *  It is a SIBLING of the row body, never nested inside it, and the row marks
 *  its subtree so a click here installs without also opening the row — see
 *  `CatalogRow`'s `action` slot. */
export function CatalogAddButton({
  label,
  busy = false,
  className,
  disabled,
  ...rest
}: Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  label: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || busy}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors",
        "hover:bg-input focus-visible:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40",
        busy ? "" : "disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {busy ? (
        <Spinner className="size-4" />
      ) : (
        <Plus className="size-5" aria-hidden />
      )}
    </button>
  );
}
