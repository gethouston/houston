/**
 * The typed `invoke` seam of the bridge.
 *
 * Every other module in this directory reaches native code through
 * `invokeNative`, so `@tauri-apps/api/core`'s `invoke` is imported exactly once
 * in `app/src` and the boundary check has a single anchor to point at.
 *
 * Deliberately NOT re-exported from the `os-bridge` barrel: a caller holding
 * `invokeNative` would skip the wrapper that records why the command is native.
 */

import { invoke } from "@tauri-apps/api/core";
import type { DesktopNativeCommand } from "../desktop-native-commands";

/**
 * `invoke`, narrowed to the declared native surface. Reaching for a command
 * that is not in `desktop-native-commands.ts` is a TYPE error here, so the
 * boundary is stated where the call is written rather than only in CI.
 */
export function invokeNative<T>(
  command: DesktopNativeCommand,
  args?: Parameters<typeof invoke>[1],
  options?: Parameters<typeof invoke>[2],
): Promise<T> {
  return invoke<T>(command, args, options);
}
