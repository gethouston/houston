import { Channel } from "@tauri-apps/api/core";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import { invokeNative } from "./invoke.ts";

export function osCurrentAppBundlePath(): Promise<string> {
  return invokeNative<string>("current_app_bundle_path");
}

export function osDownloadUpdate(
  rid: number,
  attempts: number,
  onEvent: (event: DownloadEvent) => void,
): Promise<number> {
  const channel = new Channel<DownloadEvent>();
  channel.onmessage = onEvent;
  return invokeNative<number>("download_update", {
    rid,
    attempts,
    on_event: channel,
  });
}

export function osInstallUpdate(rid: number, bytesRid: number): Promise<void> {
  return invokeNative<void>("install_update", { rid, bytes_rid: bytesRid });
}

export function osRelaunchAppFromPath(appPath: string): Promise<void> {
  return invokeNative<void>("relaunch_app_from_path", { app_path: appPath });
}
