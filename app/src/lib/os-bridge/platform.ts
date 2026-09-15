/**
 * The non-command half of the bridge: which shell the frontend is running in,
 * and the local Tauri events that never leave the desktop process. Neither
 * touches `invoke`, so neither belongs to a native-command category.
 */

import { isTauri } from "@tauri-apps/api/core";
import {
  type Event,
  emit,
  listen,
  type UnlistenFn,
} from "@tauri-apps/api/event";

/**
 * True when running inside the Tauri desktop shell, false in a plain
 * browser (the webapp / mobile PWA pointed at a remote engine).
 *
 * This is the load-bearing distinction for provider sign-in: only the
 * desktop app is co-located with its engine, so only there can a
 * provider CLI's `localhost` OAuth callback reach the user's browser.
 * Remote clients must request the headless device-code flow instead
 * (see the AI hub's `use-provider-connections`). Delegates to
 * `@tauri-apps/api`'s blessed check (the global `isTauri` flag the
 * webview sets) rather than poking internals ourselves.
 */
export function osIsTauri(): boolean {
  return isTauri();
}

export function legacyListen<T>(
  event: string,
  handler: (ev: Event<T>) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, handler);
}

export function legacyEmit(event: string, payload?: unknown): Promise<void> {
  return emit(event, payload);
}
