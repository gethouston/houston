import { resolveEngine } from "./engine-mode.ts";

export type AppUpdateChannel = "cloud" | "local";

declare global {
  interface Window {
    __HOUSTON_APP_VERSION__?: string;
  }
}

export function appUpdateChannel(env: {
  VITE_NEW_ENGINE_URL?: string;
  VITE_HOSTED_ENGINE_URL?: string;
  VITE_HOSTED_ENGINE_AUTH?: string;
}): AppUpdateChannel {
  const kind = resolveEngine(env).kind;
  return kind === "hosted-oauth" || kind === "hosted-static"
    ? "cloud"
    : "local";
}

export function formatAppVersionHeader(
  version: string,
  channel: AppUpdateChannel,
): string {
  return `${version}+${channel}`;
}

export function currentAppVersion(): string {
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
}

export function installAppVersionBridge(opts: {
  version: string;
  channel: AppUpdateChannel;
}): void {
  if (typeof window === "undefined") return;
  window.__HOUSTON_APP_VERSION__ = formatAppVersionHeader(
    opts.version,
    opts.channel,
  );
}
