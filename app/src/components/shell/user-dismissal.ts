export function createUserDismissal() {
  let synthetic = false;
  const mark = (event: { preventDefault(): void }, trusted: boolean): void => {
    if (trusted) return;
    event.preventDefault();
    synthetic = true;
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
