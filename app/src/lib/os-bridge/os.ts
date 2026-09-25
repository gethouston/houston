/**
 * `os` category: this machine's shell — file manager, default browser, default
 * apps, windows, OS notifications and the native save/open dialogs.
 *
 * Every answer here is a property of the machine the user sits at, so none of
 * it can move to the engine, which may run on a remote VPS.
 */

import { isTauri } from "@tauri-apps/api/core";
import { toUrlOpenFailure, UrlOpenError } from "../url-open-failure.ts";
import { invokeNative } from "./invoke.ts";

/**
 * Open a URL in the user's default browser. Resolves `false` when the browser
 * REFUSED the open — the web build's popup blocker after an async hop — so a
 * caller can offer an explicit click instead of claiming a tab it never
 * opened. The desktop shell hands the URL to the OS and always resolves
 * `true` (a failure rejects).
 */
export async function osOpenUrl(url: string): Promise<boolean> {
  let opened: boolean | undefined;
  try {
    opened = await invokeNative<boolean | undefined>("open_url", { url });
  } catch (err) {
    // The shell rejects typed (`url_open_failure.rs`); as an Error the
    // report layer can classify a browserless machine on the paths that
    // keep the rejection (the codex loopback relay, PRODUCT-1814).
    throw new UrlOpenError(toUrlOpenFailure(err));
  }
  return opened !== false;
}

/** Pull the Houston window to the front. Used when a flow finishes in the
 * user's browser (e.g. a Composio integration connection lands) and we want
 * the app to surface itself — the same snap-back the sign-in loopback does.
 * No-op outside Tauri. */
export function osFocusWindow(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invokeNative<void>("focus_main_window");
}

/** Reveal an agent-relative file in Finder / Explorer. */
export function osRevealFile(
  agentPath: string,
  relativePath: string,
): Promise<void> {
  return invokeNative<void>("reveal_file", {
    agent_path: agentPath,
    relative_path: relativePath,
  });
}

/** Reveal the agent's folder in Finder / Explorer. */
export function osRevealAgent(agentPath: string): Promise<void> {
  return invokeNative<void>("reveal_agent", { agent_path: agentPath });
}

/** Reveal an arbitrary absolute path in Finder / Explorer. For files written
 * outside any agent root (e.g. the portable-agent exporter's save dialog). */
export function osRevealPath(path: string): Promise<void> {
  return invokeNative<void>("reveal_path", { path });
}

/** Native "Save as…" for downloaded bytes — the desktop webview ignores
 * anchor-download clicks (no download delegate), so the shell shows the OS
 * save dialog and writes the file itself (HOU-703). The bytes travel as a raw
 * IPC payload (not JSON) so large archives don't freeze the webview; the
 * filename rides in the percent-encoded `x-download-name` header. Resolves
 * with the chosen path, or null when the user cancelled the dialog. */
export function osSaveDownload(
  fileName: string,
  bytes: Uint8Array,
): Promise<WrittenFile | null> {
  return invokeNative<WrittenFile | null>("save_download", bytes, {
    headers: { "x-download-name": encodeURIComponent(fileName) },
  });
}

/** Where a shell save landed. `renamedFrom` is the name the user chose when
 *  that file was open in another program and the bytes went to a free
 *  `name (2).ext` beside it instead (PRODUCT-1732). The save commands reject
 *  with a `FileOpFailure` (`file-op-failure.ts`), never a raw OS string. */
export interface WrittenFile {
  path: string;
  fileName: string;
  renamedFrom: string | null;
}

/** Native "Open…" for a `.houstonagent` file on disk. Resolves null when the
 * user cancelled the dialog. The bytes cross as a JSON number array — the same
 * shape the shell writes — and the caller wraps them in a `Uint8Array`. */
export function osOpenPortableAgent(): Promise<number[] | null> {
  return invokeNative<number[] | null>("open_portable_agent");
}

/** Where the host sidecar this shell spawned is listening. Pulled when the
 * one-shot ready event raced ahead of the webview's listener; the address and
 * token are properties of THIS machine's process, not of Houston. */
export function osEngineHandshake(): Promise<{
  baseUrl: string;
  token: string;
}> {
  return invokeNative<{ baseUrl: string; token: string }>(
    "get_engine_handshake",
  );
}

/** Open an agent-relative file with the user's default application. */
export function osOpenFile(
  agentPath: string,
  relativePath: string,
): Promise<void> {
  return invokeNative<void>("open_file", {
    agent_path: agentPath,
    relative_path: relativePath,
  });
}

/** Show a native "agent finished" notification on Linux/Windows whose click
 * raises the window and emits `notification-clicked` (which navigates to the
 * mission — a plain refocus does not). macOS uses the JS notification plugin
 * instead — see session-notifications.ts. */
export function osShowSessionNotification(
  title: string,
  body: string,
): Promise<void> {
  return invokeNative<void>("show_session_notification", { title, body });
}

/** Open the OS notification-settings pane so a user whose OS/browser blocked
 * Houston can grant delivery (macOS System Settings → Notifications; Windows
 * Settings → Notifications). Resolves false on web (no OS pane) and on Linux
 * (the native command reports it unsupported), which the caller reads as "hide
 * the button". Rejects only on an unexpected native failure so it surfaces. */
export async function osOpenNotificationSettings(): Promise<boolean> {
  if (!isTauri()) return false;
  return invokeNative<boolean>("open_notification_settings");
}
