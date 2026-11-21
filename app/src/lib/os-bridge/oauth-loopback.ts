import { isTauri } from "@tauri-apps/api/core";
import type { SupportedLocale } from "../locale.ts";
import { invokeNative } from "./invoke.ts";

export type OauthLoopbackStart =
  | {
      status: "listening";
      redirectUri: string;
      port: number;
      attemptId: number;
    }
  | {
      status: "superseded";
    }
  | {
      status: "portBusy";
    };

export function osStartOauthLoopback(
  expectedState: string,
  exactPort?: number,
): Promise<OauthLoopbackStart> {
  return invokeNative<OauthLoopbackStart>("start_oauth_loopback", {
    expected_state: expectedState,
    ...(exactPort === undefined ? {} : { exact_port: exactPort }),
  });
}

export function osCancelOauthLoopback(attemptId: number): Promise<void> {
  return invokeNative<void>("cancel_oauth_loopback", { attempt_id: attemptId });
}

export interface ChannelsLoopbackStart {
  port: number;
  attemptId: number;
}

export interface ChannelsLoopbackPageCopy {
  heading: string;
  body: string;
}

export interface ChannelsLoopbackCopy {
  lang: SupportedLocale;
  success: ChannelsLoopbackPageCopy;
  stale: ChannelsLoopbackPageCopy;
  openButton: string;
}

export function osStartChannelsLoopback(
  expectedState: string,
  copy: ChannelsLoopbackCopy,
  provider: "slack" | "linkedin" = "slack",
): Promise<ChannelsLoopbackStart> {
  return invokeNative<ChannelsLoopbackStart>("start_channels_loopback", {
    expected_state: expectedState,
    copy,
    provider,
  });
}

export function osCancelChannelsLoopback(attemptId: number): Promise<void> {
  return invokeNative<void>("cancel_channels_loopback", {
    attempt_id: attemptId,
  });
}

export function osStartCodexOauthLoopback(): Promise<void> {
  return invokeNative<void>("start_codex_oauth_loopback");
}

export function osStartClaudeLogin(handoff: boolean): Promise<void> {
  return invokeNative<void>("start_claude_login", { handoff });
}

export function osSubmitClaudeLoginCode(code: string): Promise<void> {
  return invokeNative<void>("submit_claude_login_code", { code });
}

export function osCompleteClaudeLoginFromClipboard(): Promise<boolean> {
  return invokeNative<boolean>("complete_claude_login_from_clipboard");
}

export function osCancelClaudeLogin(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invokeNative<void>("cancel_claude_login");
}
