const NATIVE_CONTEXT_MENU_SELECTOR = [
  "input",
  "textarea",
  "select",
  "pre",
  "code",
  "[contenteditable='true']",
  "[data-native-context-menu='true']",
].join(",");

export function shouldAllowNativeContextMenu(
  target: EventTarget | null,
): boolean {
  if (hasSelectedText()) return true;
  if (!target || typeof target !== "object" || !("closest" in target))
    return false;
  const closest = target.closest;
  if (typeof closest !== "function") return false;
  return Boolean(closest.call(target, NATIVE_CONTEXT_MENU_SELECTOR));
}

function hasSelectedText(): boolean {
  const selection = globalThis.getSelection?.();
  return Boolean(
    selection && !selection.isCollapsed && selection.toString().trim(),
  );
}
