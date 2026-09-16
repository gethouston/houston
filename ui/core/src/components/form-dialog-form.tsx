"use client";

import type { ReactNode } from "react";

import { AsyncButton } from "./async-button";
import { Button } from "./button";
import { DialogFooter } from "./dialog";
import {
  type FormDialogAction,
  handleFormSubmit,
  isCompositionEnter,
  type ResolvedSecondary,
} from "./form-dialog-parts";
import { Spinner } from "./spinner";

export interface FormDialogFormProps {
  primary: FormDialogAction;
  /** The secondary, already resolved to a label and a handler, or none. */
  secondary: ResolvedSecondary | null;
  /** True while the primary's promise is in flight. */
  pending: boolean;
  /** Runs the primary. Reached by Enter and by the primary's own click alike. */
  onSubmit: () => void;
  /** The fields. Stacked at `gap-4`. */
  children: ReactNode;
}

/**
 * The submittable half of `FormDialog`: the fields and the footer, inside a
 * real `<form>`.
 *
 * A form rather than a div with a click handler, because implicit submission
 * is the browser's job and it does it better than we would: Enter in any
 * single-line field runs the primary, a `<textarea>` keeps its newline, and
 * nothing fires at all while the default button is disabled. The primary is
 * therefore the form's ONLY submit button and carries no `onClick` — clicking
 * it submits the form, so the click and the Enter key travel one path and the
 * action can never run twice for one intent.
 *
 * Separate from the recipe because the recipe renders into Radix's portal,
 * which only exists in a browser; this frame can be rendered — and tested — on
 * its own.
 */
export function FormDialogForm({
  primary,
  secondary,
  pending,
  onSubmit,
  children,
}: FormDialogFormProps) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => handleFormSubmit(event, primary, onSubmit)}
      onKeyDown={(event) => {
        // Cancelled, not merely ignored: the browser would otherwise submit on
        // the keystroke that only meant to commit the IME's candidate.
        if (isCompositionEnter(event.nativeEvent)) event.preventDefault();
      }}
    >
      <div className="flex flex-col gap-4">{children}</div>
      <DialogFooter>
        {secondary ? (
          <AsyncButton
            type="button"
            variant={secondary.variant}
            disabled={pending || secondary.disabled}
            onClick={() => secondary.run()}
          >
            {secondary.label}
          </AsyncButton>
        ) : null}
        <Button
          type="submit"
          variant={primary.variant ?? "default"}
          disabled={pending || primary.disabled}
        >
          {pending ? <Spinner /> : null}
          {pending ? (primary.pendingLabel ?? primary.label) : primary.label}
        </Button>
      </DialogFooter>
    </form>
  );
}
