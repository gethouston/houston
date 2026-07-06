import { useEffect, useState } from "react";
import { listenOsEvent } from "../../lib/events";
import { osCancelClaudeLogin } from "../../lib/os-bridge";
import { PROVIDERS } from "../../lib/providers";
import { ProviderLoginDialog } from "./provider-login-dialog";

/**
 * Shell-global spinner for the desktop Claude browser sign-in.
 *
 * The native `claude auth login` runs the whole flow itself (opens the browser,
 * catches its own callback), so there is no per-surface dialog state to thread
 * through — this component just reflects the two Tauri events the command emits:
 * `claude-login://url` (show the dialog + a "didn't open" fallback link) and
 * `claude-login://done` (dismiss). The actual card flip is driven separately by
 * `beginClaudeBrowserLogin`'s synthetic `ProviderLoginComplete`. Mounted once in
 * the shell (like `ProviderLoginFallback`). No-op in the web build (the events
 * never fire there).
 */
const ANTHROPIC = PROVIDERS.find((p) => p.id === "anthropic") ?? null;

export function ClaudeBrowserLogin() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const offUrl = listenOsEvent<string>("claude-login://url", (u) =>
      setUrl(u),
    );
    const offDone = listenOsEvent<unknown>("claude-login://done", () =>
      setUrl(null),
    );
    return () => {
      offUrl();
      offDone();
    };
  }, []);

  if (!url || !ANTHROPIC) return null;
  return (
    <ProviderLoginDialog
      provider={ANTHROPIC}
      url={url}
      userCode={null}
      browserPending
      onClose={() => {
        // Cancel kills the native `claude` child; its `done { error: null }`
        // clears the pending card without an error toast.
        void osCancelClaudeLogin();
        setUrl(null);
      }}
    />
  );
}
