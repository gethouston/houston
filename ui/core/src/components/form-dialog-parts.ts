/**
 * `FormDialog`'s logic, split from its JSX so the parts that can actually go
 * wrong — the promise state machine and the secondary's default — are unit
 * tested. Not re-exported from the package index: the recipe is the API.
 */
export interface FormDialogAction {
  label: string;
  // biome-ignore lint/suspicious/noConfusingVoidType: sync handlers return void, async ones return a Promise
  onClick?: () => void | boolean | Promise<unknown>;
  disabled?: boolean;
  variant?: "default" | "destructive";
  /** Label worn while the promise is in flight. Falls back to `label`. */
  pendingLabel?: string;
}

export const FORM_DIALOG_SIZE_CLASS: Record<"sm" | "md", string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
};

export interface ResolvedSecondary {
  label: string;
  disabled?: boolean;
  variant: "outline" | "destructive";
  // biome-ignore lint/suspicious/noConfusingVoidType: sync handlers return void, async ones return a Promise
  run: () => void | Promise<unknown>;
}

export function resolveSecondary(
  secondary: FormDialogAction | null | undefined,
  cancelLabel: string,
  close: () => void,
): ResolvedSecondary | null {
  if (secondary === null) return null;
  const onClick = secondary?.onClick;
  return {
    label: secondary?.label ?? cancelLabel,
    disabled: secondary?.disabled,
    variant: secondary?.variant === "destructive" ? "destructive" : "outline",
    run: onClick
      ? () => {
          const result = onClick();
          return typeof result === "boolean" ? undefined : result;
        }
      : close,
  };
}

export function refusesDismiss(
  inFlight: { current: boolean },
  next: boolean,
): boolean {
  return inFlight.current && !next;
}

export interface CompositionKeyEvent {
  key: string;
  isComposing: boolean;
  keyCode: number;
}

export function isCompositionEnter(event: CompositionKeyEvent): boolean {
  return event.key === "Enter" && (event.isComposing || event.keyCode === 229);
}

export function handleFormSubmit(
  event: { preventDefault: () => void },
  primary: Pick<FormDialogAction, "disabled">,
  run: () => void,
): void {
  event.preventDefault();
  if (primary.disabled) return;
  run();
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    value != null && typeof (value as { then?: unknown }).then === "function"
  );
}

export interface PendingActionHandlers {
  onPendingChange: (pending: boolean) => void;
  onResolved: () => void;
}

const staysOpen = (value: unknown) => value === false;

export function runPendingAction(
  inFlight: { current: boolean },
  // biome-ignore lint/suspicious/noConfusingVoidType: sync handlers return void, async ones return a Promise
  run: () => void | boolean | Promise<unknown>,
  handlers: PendingActionHandlers,
): Promise<unknown> | undefined {
  if (inFlight.current) return undefined;
  const result = run();
  if (!isThenable(result)) {
    if (!staysOpen(result)) handlers.onResolved();
    return undefined;
  }
  inFlight.current = true;
  handlers.onPendingChange(true);
  return result.then(
    (value) => {
      inFlight.current = false;
      handlers.onPendingChange(false);
      if (!staysOpen(value)) handlers.onResolved();
      return value;
    },
    (error: unknown) => {
      inFlight.current = false;
      handlers.onPendingChange(false);
      throw error;
    },
  );
}
