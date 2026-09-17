/**
 * `FormDialog`'s logic, split from its JSX so the parts that can actually go
 * wrong — the promise state machine and the secondary's default — are unit
 * tested. Not re-exported from the package index: the recipe is the API.
 */

export interface FormDialogAction {
  label: string;
  /**
   * May return a promise: while it is in flight the dialog stays open in a
   * pending state and refuses re-entry, then closes when it RESOLVES. A
   * rejection leaves the dialog open with the user's input intact — the one
   * place FormDialog parts ways with ConfirmDialog, which closes either way
   * because a failed delete has nothing to preserve.
   *
   * Return (or resolve) `false` to keep the dialog open on SUCCESS: minting an
   * API key reveals its secret exactly once, and closing on the happy path
   * would take the secret with it. Rejection says "that failed, correct it";
   * `false` says "that worked, and there is one more thing to see".
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: sync handlers return void, async ones return a Promise
  onClick?: () => void | boolean | Promise<unknown>;
  disabled?: boolean;
  variant?: "default" | "destructive";
  /** Label worn while the promise is in flight. Falls back to `label`. */
  pendingLabel?: string;
}

/**
 * Two widths, no third. A form dialog that needs more room than `md` is a
 * multi-step flow and belongs in `FlowSheet` — which is exactly the sprawl
 * these recipes exist to end. `sm:` because DialogContent's phone gutter
 * (`max-w-[calc(100%-2rem)]`) is the unprefixed base: an unprefixed cap here
 * would be merged over it and the dialog would go edge-to-edge on phones.
 */
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

/**
 * The secondary control: the caller's, a Cancel that closes, or none at all.
 *
 * `outline` is the confirm dialog's Cancel, and a form's second button is the
 * same button doing the same job — a ghost one sat on the surface as text
 * beside a filled pill and read as a link rather than the way out.
 *
 * An action WITHOUT `onClick` closes the dialog (the Cancel every form needs).
 * An action WITH one hands that handler the wheel and closes nothing — so a
 * "Back" that walks a caller's own steps stays on screen instead of dismissing
 * the surface the user is still inside.
 *
 * `null` is the reveal posture: the work is already done and irreversible (a
 * key minted, its secret shown once), so a button offering to cancel it would
 * be a lie. One way out, and it is the primary.
 */
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
    // The promise is handed on (the AsyncButton's spinner and re-entry guard
    // ride on it); a boolean is dropped, because "stay open" is a statement
    // about the PRIMARY's work and the secondary never closes on its own.
    run: onClick
      ? () => {
          const result = onClick();
          return typeof result === "boolean" ? undefined : result;
        }
      : close,
  };
}

/**
 * True when this `onOpenChange` must be ignored.
 *
 * Escape, the overlay and the X all arrive as one `onOpenChange(false)`, and
 * while the primary's promise is in flight none of them may take a half-saved
 * form off the screen. Opening is never refused — only the dismissal is.
 */
export function refusesDismiss(
  inFlight: { current: boolean },
  next: boolean,
): boolean {
  return inFlight.current && !next;
}

export interface CompositionKeyEvent {
  key: string;
  isComposing: boolean;
  /** Legacy, and the only signal Safari leaves behind. */
  keyCode: number;
}

/**
 * True when this Enter is an IME committing a composition, not a submission.
 *
 * `isComposing` is the modern signal; Safari fires `compositionend` before the
 * keydown and clears it, leaving only the legacy 229 keyCode — so both are
 * read. Without this, the Enter a Japanese or Chinese typist presses to pick a
 * candidate would send the form with half a word in it.
 */
export function isCompositionEnter(event: CompositionKeyEvent): boolean {
  return event.key === "Enter" && (event.isComposing || event.keyCode === 229);
}

/**
 * The form's submit: the primary's own click AND Enter in any single-line
 * field both arrive here, because the primary is the form's submit button.
 *
 * `preventDefault` because nothing here navigates — the primary IS the
 * submission. The disabled check is belt and braces: the browser already
 * refuses implicit submission when the default button is disabled, but a
 * caller's own submit control among the fields is not covered by that.
 */
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
  /** Flips true while the promise is in flight, false once it settles. */
  onPendingChange: (pending: boolean) => void;
  /**
   * Runs when the action RESOLVES (or was synchronous) — never on a rejection,
   * and never when it resolved `false`, which is the caller asking to stay.
   */
  onResolved: () => void;
}

/** The one outcome that keeps the dialog open on success. */
const staysOpen = (value: unknown) => value === false;

/**
 * Runs a maybe-async action exactly once and reports what it is doing.
 *
 * `inFlight` is a React ref, deliberately: the guard has to flip in the same
 * tick as the click, before React commits the re-render that disables the
 * button, or a same-frame rage click fires the action twice (HOU-465). The
 * returned promise goes back to the AsyncButton so the spinner and the
 * dialog's pending state are driven by one and the same promise.
 */
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
  // Not `finally`: resolve closes, rejection does not — and the rejection is
  // re-thrown rather than swallowed so a failing handler still surfaces
  // (the AsyncButton posture) instead of dying silently in the dialog.
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
