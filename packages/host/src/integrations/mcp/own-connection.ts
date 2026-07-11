import type { Connection, Toolkit, ToolMatch } from "../types";
import type { McpAuthStore } from "./auth-store";

/**
 * The MCP server's OWN identity on the port: its pseudo-toolkit (the "app"
 * whose connect runs the MCP OAuth), its `mcp:<id>` connection derived from
 * the stored token state, and the connectable search entry shown while signed
 * out. Everything about the apps BEHIND a hub lives in hub.ts instead.
 */
export class OwnConnection {
  readonly connectionId: string;

  constructor(
    private readonly store: McpAuthStore,
    private readonly id: string,
    private readonly name: string,
    readonly description: string,
  ) {
    this.connectionId = `mcp:${id}`;
  }

  async signedIn(): Promise<boolean> {
    return !!(await this.store.read(this.id)).tokens;
  }

  toolkit(): Toolkit {
    return { slug: this.id, name: this.name, description: this.description };
  }

  /** The `mcp:<id>` connection as the token state stands, or null. */
  async current(): Promise<Connection | null> {
    const state = await this.store.read(this.id);
    if (state.tokens) return this.connection("active");
    if (state.pending) return this.connection("pending");
    return null;
  }

  connection(status: Connection["status"]): Connection {
    return { toolkit: this.id, connectionId: this.connectionId, status };
  }

  /** Drop the stored authorization (sign out of the server). */
  async clear(): Promise<void> {
    const state = await this.store.read(this.id);
    delete state.tokens;
    delete state.pending;
    delete state.codeVerifier;
    await this.store.write(this.id, state);
  }

  connectable(): ToolMatch {
    return {
      action: "",
      toolkit: this.id,
      description: this.description,
      connected: false,
      status: "connectable",
    };
  }
}
