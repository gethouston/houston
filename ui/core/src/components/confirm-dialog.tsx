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
  /**
   * May return a promise (the AsyncButton idiom, HOU-465): while it is in
   * flight the dialog STAYS OPEN in a pending state — both buttons disable,
   * the action shows a spinner with `pendingLabel` (falling back to
   * `confirmLabel`), and close requests (Esc, overlay) are refused — then
   * closes when it settles. A sync handler keeps the classic confirm-and-close.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: sync handlers return void, async ones return a Promise
  onConfirm: () => void | Promise<unknown>;
  pendingLabel?: string;
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
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);
  // Same-frame rage clicks land before React commits `disabled` (HOU-465), so
  // an instant ref guards re-entry; `mounted` keeps the settle callback from
  // touching state after the owner unmounted the dialog mid-flight.
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
    if (!isThenable(result)) return; // sync confirm: the default close stands
    // Radix's Action closes the dialog after this handler unless prevented —
    // the pending state must be visible until the work settles.
    event.preventDefault();
    inFlight.current = true;
    setPending(true);
    // `finally` resets and closes without swallowing a rejection (the
    // AsyncButton posture): a failing handler still rejects up the chain
    // rather than being silently dropped.
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
      <AlertDialogContent>
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
