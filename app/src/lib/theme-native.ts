/**
 * The native window's theme, serialized.
 *
 * The window is ONE resource and `setTheme` has no ordering of its own: the calls
 * cross the Tauri IPC and can land in either order, so picking System and then
 * Dark could leave the window following the OS — the System release landing last
 * — while the preference and the DOM both read Dark. That is not a cosmetic
 * title-bar glitch: the webview derives `prefers-color-scheme` from the window
 * (see `./theme-boot`), so the mismatch is what makes the app answer the OS
 * appearance under an explicit mode, and the reverse leaves `system` wearing the
 * last mode that was pinned.
 *
 * So the window is driven through a single slot: the calls run one after
 * another, and an intent the slot no longer holds is dropped before it reaches
 * the window. The newest intent is the only one that can win.
 *
 * The window itself is the caller's to reach (`./theme-apply`), which is what
 * keeps this module free of Tauri and drivable by a fake in tests.
 */

import type { ResolvedMode } from "./theme-model";

/** `null` is Tauri's follow-the-OS value; a mode pins the window to it. */
export type NativeTheme = ResolvedMode | null;

/**
 * Wrap a raw `setTheme` in that single slot, returning the function every apply
 * calls.
 *
 * Its promise settles when this intent is done with the window, and resolves
 * WITHOUT calling it when a newer intent has already superseded this one: nothing
 * failed, and the newer call owns the outcome.
 */
export function serializeNativeTheme(
  setTheme: (theme: NativeTheme) => Promise<void>,
): (theme: NativeTheme) => Promise<void> {
  let latest: symbol = Symbol("none");
  let queue: Promise<void> = Promise.resolve();
  return (theme) => {
    const intent = Symbol(theme ?? "system");
    latest = intent;
    const call = queue.then(() =>
      latest === intent ? setTheme(theme) : undefined,
    );
    // The queue has to keep flowing past a failure, and it is `call` — not this
    // tail — that the caller awaits and reports on (`./theme-apply`). A rejected
    // tail would skip every later intent instead, which is the same stuck window
    // by another route.
    queue = call.then(
      () => undefined,
      () => undefined,
    );
    return call;
  };
}
