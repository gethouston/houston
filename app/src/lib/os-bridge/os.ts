import { isTauri } from "@tauri-apps/api/core";
import { getCurrent } from "@tauri-apps/plugin-deep-link";
import { toUrlOpenFailure, UrlOpenError } from "../url-open-failure.ts";
import { invokeNative } from "./invoke.ts";

export async function osOpenUrl(url: string): Promise<boolean> {
  let opened: boolean | undefined;
  try {
    opened = await invokeNative<boolean | undefined>("open_url", { url });
  } catch (err) {
    throw new UrlOpenError(toUrlOpenFailure(err));
  }
  return opened !== false;
}

export function osFocusWindow(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invokeNative<void>("focus_main_window");
}

export function osCurrentDeepLinks(): Promise<string[]> {
  if (!isTauri()) return Promise.resolve([]);
  return getCurrent().then((urls) => urls ?? []);
}

export function osRevealFile(
  agentPath: string,
  relativePath: string,
): Promise<void> {
  return invokeNative<void>("reveal_file", {
    agent_path: agentPath,
    relative_path: relativePath,
  });
}

export function osRevealAgent(agentPath: string): Promise<void> {
  return invokeNative<void>("reveal_agent", { agent_path: agentPath });
}

export function osRevealPath(path: string): Promise<void> {
  return invokeNative<void>("reveal_path", { path });
}

export function osSaveDownload(
  fileName: string,
  bytes: Uint8Array,
): Promise<WrittenFile | null> {
  return invokeNative<WrittenFile | null>("save_download", bytes, {
    headers: { "x-download-name": encodeURIComponent(fileName) },
  });
}

export interface WrittenFile {
  path: string;
  fileName: string;
  renamedFrom: string | null;
}

export function osOpenPortableAgent(): Promise<number[] | null> {
  return invokeNative<number[] | null>("open_portable_agent");
}

export function osEngineHandshake(): Promise<{
  baseUrl: string;
  token: string;
}> {
  return invokeNative<{ baseUrl: string; token: string }>(
    "get_engine_handshake",
  );
}

export function osOpenFile(
  agentPath: string,
  relativePath: string,
): Promise<void> {
  return invokeNative<void>("open_file", {
    agent_path: agentPath,
    relative_path: relativePath,
  });
}

export function osShowSessionNotification(
  title: string,
  body: string,
): Promise<void> {
  return invokeNative<void>("show_session_notification", { title, body });
}

export async function osOpenNotificationSettings(): Promise<boolean> {
  if (!isTauri()) return false;
  return invokeNative<boolean>("open_notification_settings");
}
