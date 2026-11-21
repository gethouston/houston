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
  secondary: ResolvedSecondary | null;
  pending: boolean;
  onSubmit: () => void;
  children: ReactNode;
}

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
