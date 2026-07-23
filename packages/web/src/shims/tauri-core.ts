/**
 * Web shim for `@tauri-apps/api/core`.
 *
 * packages/web composes the desktop app's React tree (app/src) but runs in a
 * plain browser tab against the Houston host or legacy engine. There is no Tauri runtime,
 * so `invoke` can't reach native commands. Vite + tsconfig alias
 * `@tauri-apps/api/core` to this module (see vite.config.ts / tsconfig.json).
 *
 * Every `invoke(cmd)` reachable from app/src is handled here:
 *  - actions with a clean browser equivalent are implemented (open_url ->
 *    window.open, notifications -> Notification API, portable agent IO ->
 *    Blob download / <input type=file>);
 *  - logging / log-reads / handshake become harmless no-ops;
 *  - the rest throw a clear, user-facing "desktop-only" error that the app's
 *    existing toast pipeline surfaces (beta policy: no silent failures).
 *
 * The set of handled commands is asserted complete by
 * scripts/check-tauri-shims.mjs (every invoke("X") in app/src must appear here).
 */

/** Mirror of `@tauri-apps/api`'s `isTauri()` — always false in the web build. */
export function isTauri(): boolean {
  return false;
}

type InvokeArgs = Record<string, unknown> | Uint8Array | undefined;

/** Mirror of `@tauri-apps/api`'s InvokeOptions (headers ride the raw-payload
 * IPC on desktop). The web shim has no native IPC, so they're ignored. */
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
  // Revoke once the download has had time to start.
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
    // Cancel detection: the `cancel` event isn't emitted by Safari / older
    // Chromium, so also treat "window regained focus but no file was chosen"
    // as a cancel. Without this the Promise (and import-wizard's await) would
    // hang forever on those browsers.
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
  // Raw-payload invokes (desktop's binary IPC) carry bytes, not a record.
  const payload = rawArgs instanceof Uint8Array ? rawArgs : undefined;
  const args = rawArgs instanceof Uint8Array ? undefined : rawArgs;
  switch (cmd) {
    // ── Implemented with a browser-native equivalent ────────────────────
    case "open_url": {
      const url = typeof args?.url === "string" ? args.url : "";
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return undefined as T;
    }
    case "show_session_notification": {
      const title = typeof args?.title === "string" ? args.title : "Houston";
      const body = typeof args?.body === "string" ? args.body : "";
      try {
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          const n = new Notification(title, { body });
          // Desktop uses window-focus as the click->navigate proxy; replicate
          // it so the app's existing onFocusChanged nav path fires on web too.
          n.onclick = () => {
            window.focus();
            n.close();
          };
        }
      } catch {
        /* notifications blocked / unavailable */
      }
      return undefined as T;
    }
    case "save_portable_agent": {
      const name =
        typeof args?.default_name === "string"
          ? args.default_name
          : "agent.houstonagent";
      const bytes = Array.isArray(args?.bytes) ? (args.bytes as number[]) : [];
      downloadBytes(name, bytes);
      // Native returns the saved path; the web download has no path, so echo
      // the filename — callers only use it for a "saved" confirmation toast.
      return name as T;
    }
    case "open_portable_agent": {
      const bytes = await pickFileBytes(".houstonagent,application/zip");
      return bytes as T;
    }
    case "save_download": {
      // Unreachable in practice: `saveBlob` checks isTauri() (false here) and
      // uses the anchor download directly. Keep an honest fallback anyway —
      // returning null means "the browser manages the download", so the
      // caller shows no desktop-style saved toast.
      if (payload) downloadBytes("download", Array.from(payload));
      return null as T;
    }

    case "report_bug": {
      // Cloud mode: the control plane fronts the same Linear intake the desktop
      // reaches via Tauri (POST /feedback, Supabase-authed). Outside cloud mode
      // there is nowhere to send it, so fall through to the desktop-only error.
      const cp = window.__HOUSTON_CP__ ? window.__HOUSTON_ENGINE__ : undefined;
      if (!cp?.baseUrl) return notAvailable(cmd);
      const res = await fetch(`${cp.baseUrl.replace(/\/+$/, "")}/feedback`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cp.token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args?.payload ?? {}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `feedback failed (${res.status})`);
      }
      const out = (await res.json()) as { id: string | null };
      return out.id as T;
    }

    // ── Harmless no-ops (feature simply absent on web) ──────────────────
    case "write_frontend_log":
      // Browser devtools already shows console output; nothing to persist.
      return undefined as T;
    case "read_recent_logs":
      // No local log files in a browser; bug-report bundles empty tails.
      return { backend: "", frontend: "" } as T;
    case "focus_main_window":
      // The web build is a single browser tab; there's no OS window to raise.
      return undefined as T;
    case "saved_bridge_target":
      // The web app never runs a local-model bridge (no native frpc), so it can
      // never own a saved target. Returning null is the honest answer and keeps
      // the tunnel-vs-direct pill rule correct: a connected openai-compatible
      // endpoint on web reads as normally connected, not as a bridge.
      return null as T;
    case "take_pending_store_deep_link":
      // The web build reads the store-install target from the `?install=<slug>`
      // query param directly (there is no native deep-link stash), so this
      // cold-start drain has nothing to return. `osTakePendingStoreDeepLink`
      // already short-circuits to null off-Tauri; this keeps shim parity intact.
      return null as T;
    case "detect_legacy_houston":
      // A browser tab has no local `~/.houston` tree to migrate — "nothing
      // found" is the honest answer and keeps the cloud-migration wizard
      // (HOU-719) permanently closed on web.
      return {
        hasWorkspaces: false,
        hasChatDb: false,
        workspaceDirs: [],
        agentDirCount: 0,
      } as T;

    // ── Desktop-only: surface a clear error if a user triggers them ─────
    case "start_oauth_loopback": // desktop uses a native loopback listener; web uses the firebase-js-sdk popup
    case "cancel_oauth_loopback": // frees the desktop loopback port; web has no local listener to cancel
    case "start_codex_oauth_loopback": // desktop relays the Codex 1455 callback; web stays on device-code
    case "start_claude_login": // desktop runs `claude auth login`; web uses the setup-token paste flow
    case "cancel_claude_login": // desktop-only sign-in helper; no web counterpart
    case "submit_claude_login_code": // relays a pasted code to the desktop `claude` child's stdin
    case "read_claude_credential": // reads this machine's Keychain/cred file; web has neither

    case "get_engine_handshake": // web injects window.__HOUSTON_ENGINE__ directly
    // The guided "connect a local model" bridge scans localhost and runs an
    // frpc sidecar — both need the native desktop shell. The browser build
    // gates the guided flow on isTauri() and shows the manual endpoint form
    // instead, so these are never reached here; surface a clear error if they
    // somehow are (no silent failure).
    case "detect_local_models":
    case "start_local_bridge":
    case "reconnect_local_bridge":
    case "stop_local_bridge":
    case "local_bridge_status":
    // On-device dictation runs a bundled whisper.cpp sidecar — desktop-only,
    // no browser equivalent. `useDictation` gates on `osIsTauri()` so the web
    // build never triggers these; surface a clear error if it somehow does.
    case "transcribe_audio":
    case "dictation_model_status":
    case "download_dictation_model":
    // The cloud-migration wizard's source host is a native subprocess spawned
    // against the old local install — meaningless in a browser, and the
    // detect shim above guarantees the wizard never asks for it on web.
    case "start_migration_source_host":
    case "stop_migration_source_host":
    // Backing up the local `~/.houston` tree needs native filesystem access; a
    // browser tab has no such folder (detect_legacy_houston returns empty, so
    // the wizard never reaches the backup step on web).
    case "backup_houston_data":
    case "pick_directory":
    case "reveal_file":
    case "reveal_agent":
    case "reveal_path":
    case "open_file":
    case "current_app_bundle_path":
    case "relaunch_app_from_path":
    case "sentry_native_stack_smoke_test":
      return notAvailable(cmd);

    // auth_get_item / auth_set_item / auth_remove_item are keychain-only; the
    // web build forces browser (localStorage) storage, so they never run and
    // fall through to the default guard below.
    default:
      return notAvailable(cmd);
  }
}
