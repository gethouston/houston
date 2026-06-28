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

type InvokeArgs = Record<string, unknown> | undefined;

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
  args?: InvokeArgs,
): Promise<T> {
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
    case "check_claude_cli":
      // The CLI lives on the engine host, not the browser. Provider status
      // (an engine route) is the real signal used elsewhere in the UI.
      return false as T;

    // ── Desktop-only: surface a clear error if a user triggers them ─────
    case "get_engine_handshake": // web injects window.__HOUSTON_ENGINE__ directly
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
