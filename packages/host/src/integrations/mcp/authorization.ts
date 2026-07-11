import {
  auth,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { McpAuthStore } from "./auth-store";

export interface McpServerConfig {
  id: string;
  url: string;
  name?: string;
  redirectUrl: string;
}

export type McpAuthorizationExchanger = (
  provider: OAuthClientProvider,
  serverUrl: string,
  code: string,
) => Promise<void>;

export const defaultMcpAuthorizationExchange: McpAuthorizationExchanger =
  async (provider, serverUrl, code) => {
    const result = await auth(provider, {
      serverUrl,
      authorizationCode: code,
    });
    if (result !== "AUTHORIZED") {
      throw new Error("MCP OAuth exchange did not authorize");
    }
  };

export class PendingAuthorizationClaimer {
  private lock: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: McpAuthStore,
    private readonly id: string,
  ) {}

  async claim(state: string, nowMs: number): Promise<boolean> {
    let release!: () => void;
    const previous = this.lock;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const stored = await this.store.read(this.id);
      const pending = stored.pending;
      if (!pending || pending.state !== state) return false;
      delete stored.pending;
      await this.store.write(this.id, stored);
      return nowMs - pending.startedAtMs <= 10 * 60_000;
    } finally {
      release();
    }
  }
}
