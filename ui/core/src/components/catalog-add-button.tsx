"use client";

import { Plus } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../utils";
import { Spinner } from "./spinner";

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
