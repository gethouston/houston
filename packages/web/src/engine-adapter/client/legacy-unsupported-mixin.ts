import type { BaseCtor } from "./mixin";

/**
 * The legacy `@houston-ai/engine-client` methods for desktop / Rust-engine
 * features that DO NOT EXIST on the Houston TS host engine (worktrees, shell,
 * phone tunnel/pairing, the Claude/Composio/Gemini CLIs). The old adapter masked
 * them with a catch-all `Proxy` that silently returned `[]` — a no-silent-failure
 * violation that also hid genuine typos/missing methods. Each now throws a clear,
 * explicit error, so a stray call surfaces (we WANT the bug report) instead of a
 * silent empty. The live new-engine UI does not call these (their surfaces were
 * removed in the convergence to one engine); a genuinely undefined method now
 * throws a real TypeError rather than resolving to `[]`.
 */
function unsupported(method: string): never {
  throw new Error(
    `${method}() is unavailable on the Houston host engine — this legacy desktop/Rust-engine capability was removed in the convergence to a single TS engine.`,
  );
}

export function LegacyUnsupportedMixin<TBase extends BaseCtor>(Base: TBase) {
  class LegacyUnsupported extends Base {
    async setGeminiApiKey(): Promise<never> {
      return unsupported("setGeminiApiKey");
    }
    async createWorktree(): Promise<never> {
      return unsupported("createWorktree");
    }
    async listWorktrees(): Promise<never> {
      return unsupported("listWorktrees");
    }
    async removeWorktree(): Promise<never> {
      return unsupported("removeWorktree");
    }
    async runShell(): Promise<never> {
      return unsupported("runShell");
    }
    async tunnelStatus(): Promise<never> {
      return unsupported("tunnelStatus");
    }
    async mintPairingCode(): Promise<never> {
      return unsupported("mintPairingCode");
    }
    async resetPhoneAccess(): Promise<never> {
      return unsupported("resetPhoneAccess");
    }
    async claudeStatus(): Promise<never> {
      return unsupported("claudeStatus");
    }
    async claudeInstall(): Promise<never> {
      return unsupported("claudeInstall");
    }
    async composioStatus(): Promise<never> {
      return unsupported("composioStatus");
    }
    async composioCliInstalled(): Promise<never> {
      return unsupported("composioCliInstalled");
    }
    async composioInstallCli(): Promise<never> {
      return unsupported("composioInstallCli");
    }
    async composioStartLogin(): Promise<never> {
      return unsupported("composioStartLogin");
    }
    async composioCompleteLogin(): Promise<never> {
      return unsupported("composioCompleteLogin");
    }
    async composioLogout(): Promise<never> {
      return unsupported("composioLogout");
    }
    async composioListApps(): Promise<never> {
      return unsupported("composioListApps");
    }
    async composioListConnections(): Promise<never> {
      return unsupported("composioListConnections");
    }
    async composioConnectApp(): Promise<never> {
      return unsupported("composioConnectApp");
    }
    async composioDisconnect(): Promise<never> {
      return unsupported("composioDisconnect");
    }
    async composioReconnect(): Promise<never> {
      return unsupported("composioReconnect");
    }
    async composioWatchConnection(): Promise<never> {
      return unsupported("composioWatchConnection");
    }
  }
  return LegacyUnsupported;
}
