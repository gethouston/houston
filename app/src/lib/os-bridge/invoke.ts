import { invoke } from "@tauri-apps/api/core";
import type { DesktopNativeCommand } from "../desktop-native-commands";

export function invokeNative<T>(
  command: DesktopNativeCommand,
  args?: Parameters<typeof invoke>[1],
  options?: Parameters<typeof invoke>[2],
): Promise<T> {
  return invoke<T>(command, args, options);
}
