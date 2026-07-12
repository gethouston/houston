import { randomBytes } from "node:crypto";
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

/**
 * Start the server's OWN OAuth: mint + persist the single-use state nonce, run
 * the SDK flow far enough to produce the authorization URL (registering the
 * client on first use), and roll the pending record back if it fails so an
 * aborted start never wedges the next one.
 */
export async function startOwnAuthorization(args: {
  store: McpAuthStore;
  id: string;
  oauth: OAuthClientProvider;
  serverUrl: string;
  takeAuthorizationUrl: () => string | undefined;
}): Promise<string> {
  const state = await args.store.read(args.id);
  state.pending = {
    state: randomBytes(32).toString("base64url"),
    startedAtMs: Date.now(),
  };
  await args.store.write(args.id, state);
  try {
    await auth(args.oauth, { serverUrl: args.serverUrl });
    const url = args.takeAuthorizationUrl();
    if (!url) throw new Error("MCP OAuth returned no authorization URL");
    return url;
  } catch (error) {
    const failed = await args.store.read(args.id);
    delete failed.pending;
    await args.store.write(args.id, failed);
    throw error;
  }
}
