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
  title: string;
  description?: string;
  size?: "sm" | "md";
  primary: FormDialogAction;
  secondary?: FormDialogAction | null;
  labels?: { cancel?: string; close?: string };
  children: ReactNode;
}

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
    void runPrimary();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (refusesDismiss(inFlight, next)) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={cn("gap-4", FORM_DIALOG_SIZE_CLASS[size])}
        closeLabel={labels?.close ?? "Close"}
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
