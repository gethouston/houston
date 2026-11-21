import { reportBugViaGateway } from "../report-bug-intake";
import { nativeShell } from "./native-shell";

export function isTauri(): boolean {
  return false;
}

type InvokeArgs = Record<string, unknown> | Uint8Array | undefined;

export class Channel<T = unknown> {
  onmessage: (response: T) => void = () => {};
  constructor(onmessage?: (response: T) => void) {
    if (onmessage) this.onmessage = onmessage;
  }
  toJSON(): string {
    return "__CHANNEL__:web";
  }
}

type InvokeOptions = { headers?: Record<string, string> };

function notAvailable(cmd: string): never {
  throw new Error(
    `This is a desktop-only action and isn't available in the Houston web app (${cmd}).`,
  );
}

function downloadBytes(name: string, bytes: number[]): void {
  const blob = new Blob([new Uint8Array(bytes)], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "agent.houstonagent";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function pickFileBytes(accept: string): Promise<number[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const done = (value: number[] | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(value);
    };
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files || input.files.length === 0) done(null);
      }, 300);
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        done(null);
        return;
      }
      file
        .arrayBuffer()
        .then((buf) => done(Array.from(new Uint8Array(buf))))
        .catch(() => done(null));
    });
    input.addEventListener("cancel", () => done(null));
    window.addEventListener("focus", onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

export async function invoke<T = unknown>(
  cmd: string,
  rawArgs?: InvokeArgs,
  _options?: InvokeOptions,
): Promise<T> {
  const payload = rawArgs instanceof Uint8Array ? rawArgs : undefined;
  const args = rawArgs instanceof Uint8Array ? undefined : rawArgs;
  switch (cmd) {
    case "open_url": {
      const url = typeof args?.url === "string" ? args.url : "";
      if (!url) return false as T;
      const shell = nativeShell();
      if (shell) return (await shell.openUrl(url)) as T;
      const tab = window.open(url, "_blank");
      if (tab) tab.opener = null;
      return (tab !== null) as T;
    }
    case "show_session_notification": {
      if (nativeShell()) return undefined as T;
      const title = typeof args?.title === "string" ? args.title : "Houston";
      const body = typeof args?.body === "string" ? args.body : "";
      try {
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          const n = new Notification(title, { body });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        }
      } catch {}
      return undefined as T;
    }
    case "open_portable_agent": {
      const bytes = await pickFileBytes(".houstonagent,application/zip");
      return bytes as T;
    }
    case "save_download": {
      if (payload) downloadBytes("download", Array.from(payload));
      return null as T;
    }

    case "report_bug": {
      const cp = window.__HOUSTON_CP__ ? window.__HOUSTON_ENGINE__ : undefined;
      if (!cp?.baseUrl) return notAvailable(cmd);
      return (await reportBugViaGateway(cp, args?.payload)) as T;
    }

    case "write_frontend_log":
      return undefined as T;
    case "read_recent_logs":
      return { backend: "", frontend: "" } as T;
    case "focus_main_window":
      return undefined as T;
    case "open_notification_settings":
      return false as T;
    case "saved_bridge_target":
      return null as T;
    case "detect_legacy_houston":
      return {
        hasWorkspaces: false,
        hasChatDb: false,
        workspaceDirs: [],
        agentDirCount: 0,
      } as T;

    case "launch_t0_ms":
      return null as T;

    case "start_oauth_loopback":
    case "cancel_oauth_loopback":
    case "start_channels_loopback":
    case "cancel_channels_loopback":
    case "start_codex_oauth_loopback":
    case "start_claude_login":
    case "cancel_claude_login":
    case "submit_claude_login_code":
    case "complete_claude_login_from_clipboard":
    case "read_claude_credential":
    case "discard_claude_handoff_credential":

    case "get_engine_handshake":
    case "detect_local_models":
    case "start_local_bridge":
    case "local_bridge_device":
    case "save_bridge_target":
    case "forget_bridge_target":
    case "renew_local_bridge":
    case "local_bridge_legacy_candidate":
    case "local_bridge_complete_migration":
    case "stop_local_bridge":
    case "transcribe_audio":
    case "dictation_model_status":
    case "download_dictation_model":
    case "start_migration_source_host":
    case "stop_migration_source_host":
    case "backup_houston_data":
    case "reveal_file":
    case "reveal_agent":
    case "reveal_path":
    case "open_file":
    case "current_app_bundle_path":
    case "relaunch_app_from_path":
    case "download_update":
    case "install_update":
    case "sentry_native_stack_smoke_test":
      return notAvailable(cmd);

    default:
      return notAvailable(cmd);
  }
}
