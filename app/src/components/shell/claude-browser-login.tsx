import { useEffect, useState } from "react";
import { cancelClaudeBrowserLogin } from "../../lib/claude-login";
import { listenOsEvent } from "../../lib/events";
import {
  osCompleteClaudeLoginFromClipboard,
  osSubmitClaudeLoginCode,
} from "../../lib/os-bridge";
import { PROVIDERS } from "../../lib/providers";
import { ProviderLoginBrowserPending } from "./provider-login-browser-pending";

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
    <ProviderLoginBrowserPending
      provider={ANTHROPIC}
      url={url}
      onClipboardProbe={osCompleteClaudeLoginFromClipboard}
      onSubmitCode={(code) => osSubmitClaudeLoginCode(code)}
      onClose={() => {
        cancelClaudeBrowserLogin(ANTHROPIC.id);
        setUrl(null);
      }}
    />
  );
}
