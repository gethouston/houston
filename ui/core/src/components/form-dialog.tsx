"use client";

import type { ReactNode } from "react";
import * as React from "react";

import { cn } from "../utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { FormDialogForm } from "./form-dialog-form";
import {
  FORM_DIALOG_SIZE_CLASS,
  type FormDialogAction,
  refusesDismiss,
  resolveSecondary,
  runPendingAction,
} from "./form-dialog-parts";

export type { FormDialogAction };

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The question or the job, in the caller's language. */
  title: string;
  description?: string;
  /** `sm` for one field, `md` (default) for a short form. Nothing wider. */
  size?: "sm" | "md";
  primary: FormDialogAction;
  /**
   * Defaults to an outline Cancel that closes — the confirm's own. `null`
   * leaves the primary alone: the reveal posture, where the work already
   * happened and there is nothing left to cancel.
   */
  secondary?: FormDialogAction | null;
  labels?: { cancel?: string; close?: string };
  /** The fields. Stacked at `gap-4`; the recipe owns everything around them. */
  children: ReactNode;
}

/**
 * ConfirmDialog's frame, for a form.
 *
 * The delete confirms are the dialogs that feel finished, and the reason is
 * that nobody assembles them: one title, one line of consequence, two buttons,
 * one width. FormDialog is that same settled frame with fields in the middle —
 * so a dialog asking for a name stops inventing its own padding, its own width
 * and its own idea of where the buttons go.
 *
 * Async is the default posture, not an add-on: a primary that returns a
 * promise keeps the dialog open with a spinner, refuses the second click, and
 * closes only once the work lands. Escape, the overlay and the X are all
 * refused while it is in flight — a half-saved form must not vanish.
 *
 * Two outcomes keep the dialog on screen: a REJECTION (that failed, correct
 * it) and a resolution of `false` (that worked, and there is one more thing to
 * see — a minted key's secret, shown once). Pair the latter with
 * `secondary={null}` for the step that only acknowledges.
 *
 * The fields sit in a real `<form>`, so Enter in any single-line field runs
 * the primary exactly as a native submit would (`FormDialogForm`).
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  primary,
  secondary,
  labels,
  children,
}: FormDialogProps) {
  const [pending, setPending] = React.useState(false);
  const inFlight = React.useRef(false);
  // The owner may unmount the dialog mid-flight; the settle callback must not
  // touch state (or reopen a closed surface) after that.
  const mounted = React.useRef(true);
  React.useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const close = () => {
    if (mounted.current) onOpenChange(false);
  };
  const runPrimary = () =>
    runPendingAction(inFlight, () => primary.onClick?.(), {
      onPendingChange: (next) => {
        if (mounted.current) setPending(next);
      },
      onResolved: close,
    });

  const cancel = resolveSecondary(secondary, labels?.cancel ?? "Cancel", close);
  const submit = () => {
    // The rejection is left unhandled on purpose (the AsyncButton posture): a
    // failing save reaches the global handler and Sentry rather than dying
    // quietly inside the dialog.
    void runPrimary();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Esc, the overlay and the X all land here. While the primary is
        // working, none of them may take the form off screen.
        if (refusesDismiss(inFlight, next)) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={cn("gap-4", FORM_DIALOG_SIZE_CLASS[size])}
        closeLabel={labels?.close ?? "Close"}
        // A dialog with no description has nothing to describe it: dropping
        // the attribute is how Radix is told that on purpose, rather than
        // pointing screen readers at an element that was never rendered.
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <FormDialogForm
          primary={primary}
          secondary={cancel}
          pending={pending}
          onSubmit={submit}
        >
          {children}
        </FormDialogForm>
      </DialogContent>
    </Dialog>
  );
}
