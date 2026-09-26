/**
 * Lets only the user close a shell-level dialog.
 *
 * The app dispatches a synthetic Escape at itself when it leaves a kept-alive
 * screen while a modal holds the page (`keep-alive-views.tsx`), to close that
 * screen's own dialogs. The event is not cancelable, so Radix dismisses the
 * top layer whatever its `onEscapeKeyDown` does. A dialog that belongs to the
 * whole shell (the plan prompts) must outlive that navigation: its content
 * marks an untrusted Escape or pointer-down as synthetic, and the
 * `onOpenChange(false)` Radix sends synchronously after it is dropped. The
 * dialog is controlled, so dropping it keeps it open. Focus leaving the dialog
 * never dismisses it; Radix's modal dialog already refuses that.
 *
 * Each dialog owns one gate (`useState(createUserDismissal)`). Parameters are
 * structural so the rule is testable without a DOM.
 */
export function createUserDismissal() {
  let synthetic = false;
  const mark = (event: { preventDefault(): void }, trusted: boolean): void => {
    if (trusted) return;
    event.preventDefault();
    synthetic = true;
    // Radix's dismissal follows in the same task; the mark never outlives it.
    queueMicrotask(() => {
      synthetic = false;
    });
  };
  return {
    contentProps: {
      onEscapeKeyDown(event: { isTrusted: boolean; preventDefault(): void }) {
        mark(event, event.isTrusted);
      },
      onPointerDownOutside(event: {
        detail: { originalEvent: { isTrusted: boolean } };
        preventDefault(): void;
      }) {
        mark(event, event.detail.originalEvent.isTrusted);
      },
    },
    onOpenChange(onDismiss: () => void) {
      return (open: boolean) => {
        if (!open && !synthetic) onDismiss();
      };
    },
  };
}
