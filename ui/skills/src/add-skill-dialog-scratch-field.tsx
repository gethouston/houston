/**
 * Form primitives of ScratchView: the labelled `Field` wrapper and the shared
 * input class. `Field` owns the `useId` that binds its `<label>` to the single
 * child control, which it clones to inject that id — so the child must accept
 * an `id` prop. An `error` replaces the `hint` rather than stacking below it,
 * keeping field height stable as validation flips.
 */

import { cn } from "@houston-ai/core";
import { cloneElement, useId } from "react";

export const inputClass = cn(
  "w-full rounded-lg border border-line/20 bg-input px-3 py-2 text-sm",
  "text-ink placeholder:text-ink-muted/60",
  "outline-none focus:shadow-sm transition-shadow",
);

export function Field({
  label,
  hint,
  error,
  suffix,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  suffix?: React.ReactNode;
  children: React.ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label htmlFor={id} className="text-xs font-medium text-ink-muted">
          {label}
        </label>
        {suffix}
      </div>
      {cloneElement(children, { id })}
      {error ? (
        <p role="alert" className="text-xs text-danger-ink mt-1">
          {error}
        </p>
      ) : (
        hint && <p className="text-[11px] text-ink-muted/70 mt-1">{hint}</p>
      )}
    </div>
  );
}
