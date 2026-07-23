import { useEffect, useState } from "react";
import {
  cancelClaudeBrowserLogin,
  reconcileClaudeCredentialHandoff,
} from "../../lib/claude-login";
import { listenOsEvent } from "../../lib/events";
import {
  osCompleteClaudeLoginFromClipboard,
  osIsTauri,
  osSubmitClaudeLoginCode,
} from "../../lib/os-bridge";
import { PROVIDERS } from "../../lib/providers";
import { ProviderLoginBrowserPending } from "./provider-login-browser-pending";

/**
 * Shell-global dialog for the desktop Claude browser sign-in.
 *
 * The native `claude auth login` runs the whole flow itself (opens the browser;
 * the approval page normally hands the authorization code straight back to the
 * CLI), so there is no per-surface dialog state to thread through — this
 * component just reflects the two Tauri events the command emits:
 * `claude-login://url` (show the dialog: a "didn't open" fallback link plus the
 * code paste field for when the approval page shows the user a code instead of
 * completing automatically) and `claude-login://done` (dismiss). The actual
 * card flip is driven separately by `beginClaudeBrowserLogin`'s synthetic
 * `ProviderLoginComplete`. Mounted once in the shell (like
 * `ProviderLoginFallback`). No-op in the web build (the events never fire
 * there).
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

  // Finish any EARLIER browser login whose cloud handoff failed: the minted
  // credential is still cached on this machine, so the connect completes
  // silently, with no browser round-trip and no token paste (one-shot per
  // session; a quiet no-op when there's nothing to finish).
  useEffect(() => {
    if (osIsTauri()) void reconcileClaudeCredentialHandoff();
  }, []);

  if (!url || !ANTHROPIC) return null;
  return (
    <ProviderLoginBrowserPending
      provider={ANTHROPIC}
      url={url}
      onClipboardProbe={osCompleteClaudeLoginFromClipboard}
      onSubmitCode={(code) => osSubmitClaudeLoginCode(code)}
      onClose={() => {
        // Cancel kills the native `claude` child and clears the pending card
        // silently (single cancel path — kills the child + announces a benign
        // dismissal so every surface's spinner clears).
        cancelClaudeBrowserLogin(ANTHROPIC.id);
        setUrl(null);
      }}
    />
  );
}
