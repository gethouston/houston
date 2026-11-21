export const ACTION_BUTTON_CLASS =
  "inline-flex size-6 items-center justify-center rounded-md text-ink-muted/40 transition-colors duration-200 hover:bg-hover hover:text-ink";

export const ACTION_ICON_CLASS = "size-4";

export interface CardActionGate {
  itemStatus: string;
  actionStatuses: readonly string[];
  handled: boolean;
  hasCustomActions: boolean;
}

export function showsCardAction({
  itemStatus,
  actionStatuses,
  handled,
  hasCustomActions,
}: CardActionGate): boolean {
  return handled && !hasCustomActions && actionStatuses.includes(itemStatus);
}
