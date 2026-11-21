import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Spinner } from "./spinner";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  // biome-ignore lint/suspicious/noConfusingVoidType: sync handlers return void, async ones return a Promise
  onConfirm: () => void | Promise<unknown>;
  pendingLabel?: string;
  onCloseAutoFocus?: (event: Event) => void;
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    value != null && typeof (value as { then?: unknown }).then === "function"
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "destructive",
  onConfirm,
  pendingLabel,
  onCloseAutoFocus,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);
  const inFlight = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const handleConfirm = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (inFlight.current) {
      event.preventDefault();
      return;
    }
    const result = onConfirm();
    if (!isThenable(result)) return;
    event.preventDefault();
    inFlight.current = true;
    setPending(true);
    void result.finally(() => {
      inFlight.current = false;
      if (!mounted.current) return;
      setPending(false);
      onOpenChange(false);
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (inFlight.current && !next) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? (
              <>
                <Spinner />
                {pendingLabel ?? confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
