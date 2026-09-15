/**
 * `updater` category: replacing the running bundle, which only the shell can
 * do. The download runs in Rust (resumable, signature-verified) rather than in
 * the webview, so a dropped stream resumes instead of restarting.
 */

import { Channel } from "@tauri-apps/api/core";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import { invokeNative } from "./invoke.ts";

/** Resolve the app bundle/executable path before updater install moves it. */
export function osCurrentAppBundlePath(): Promise<string> {
  return invokeNative<string>("current_app_bundle_path");
}

/** Download the release the updater plugin's `check()` found, through the
 * shell's own resumable client (retry with backoff, `Range` resume across a
 * dropped stream), verify its signature, and stage the bytes. `rid` is the
 * plugin's `Update` resource id. Progress arrives in the plugin's own event
 * shape. Resolves with the staged-bytes resource id for `osInstallUpdate`;
 * rejects with the shell's typed failure (`update-download-failure.ts`). */
export function osDownloadUpdate(
  rid: number,
  onEvent: (event: DownloadEvent) => void,
): Promise<number> {
  const channel = new Channel<DownloadEvent>();
  channel.onmessage = onEvent;
  return invokeNative<number>("download_update", { rid, on_event: channel });
}

/** Install a release staged by `osDownloadUpdate`. On Windows the installer
 * hand-off exits this process, so the promise never settles there. */
export function osInstallUpdate(rid: number, bytesRid: number): Promise<void> {
  return invokeNative<void>("install_update", { rid, bytes_rid: bytesRid });
}

/** Relaunch the installed app from a path captured before update install. */
export function osRelaunchAppFromPath(appPath: string): Promise<void> {
  return invokeNative<void>("relaunch_app_from_path", { app_path: appPath });
}
