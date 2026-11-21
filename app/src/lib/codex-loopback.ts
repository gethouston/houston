import { shouldUseCodexLoopback } from "../components/shell/provider-login-url";
import {
  fallBackToDeviceCode,
  relayCodexCode,
} from "./codex-loopback-failures";
import {
  legacyListen,
  osIsTauri,
  osOpenUrl,
  osStartCodexOauthLoopback,
} from "./os-bridge";

const CODEX_OAUTH_CALLBACK_EVENT = "codex-oauth://callback";

const CALLBACK_TIMEOUT_MS = 5 * 60_000;

type Unlisten = Awaited<ReturnType<typeof legacyListen>>;

const activeLoopbackCleanups = new Map<string, () => void>();

export function cancelCodexLoopback(frontendProviderId: string): void {
  activeLoopbackCleanups.get(frontendProviderId)?.();
}

export async function beginCodexBrowserLogin(
  frontendProviderId: string,
  authorizeUrl: string,
): Promise<void> {
  let unlisten: Unlisten | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const cleanup = () => {
    settled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
    if (activeLoopbackCleanups.get(frontendProviderId) === cleanup)
      activeLoopbackCleanups.delete(frontendProviderId);
  };
  activeLoopbackCleanups.set(frontendProviderId, cleanup);

  try {
    unlisten = await legacyListen<string>(CODEX_OAUTH_CALLBACK_EVENT, (ev) => {
      if (settled) return;
      cleanup();
      void relayCodexCode(frontendProviderId, ev.payload);
    });
  } catch (err) {
    cleanup();
    await fallBackToDeviceCode(frontendProviderId, err);
    return;
  }

  timer = setTimeout(cleanup, CALLBACK_TIMEOUT_MS);

  try {
    await osStartCodexOauthLoopback();
    await osOpenUrl(authorizeUrl);
  } catch (err) {
    cleanup();
    await fallBackToDeviceCode(frontendProviderId, err);
  }
}

export function tryBeginCodexLoopbackLogin(ev: {
  provider: string;
  url: string;
  userCode: string | null | undefined;
}): boolean {
  if (
    !shouldUseCodexLoopback({
      provider: ev.provider,
      env: (import.meta.env ?? {}) as {
        VITE_NEW_ENGINE_URL?: string;
        VITE_HOSTED_ENGINE_URL?: string;
      },
      isTauri: osIsTauri(),
      userCode: ev.userCode,
    })
  ) {
    return false;
  }
  void beginCodexBrowserLogin(ev.provider, ev.url);
  return true;
}
