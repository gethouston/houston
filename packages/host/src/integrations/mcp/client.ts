import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpPendingAuthorizationError } from "./oauth";

const TOOLS_TTL_MS = 60_000;
type Tools = Awaited<ReturnType<Client["listTools"]>>["tools"];
export interface McpCallResult {
  content: unknown;
  structuredContent?: unknown;
  isError?: boolean;
}

export class McpAuthRequiredError extends Error {
  constructor() {
    super("MCP authorization is required");
    this.name = "McpAuthRequiredError";
  }
}

export class McpClientSession {
  private session?: {
    client: Client;
    transport: StreamableHTTPClientTransport;
  };
  private connecting?: Promise<Client>;
  private toolsCache?: { at: number; tools: Tools };

  constructor(
    private readonly url: string,
    private readonly authProvider: OAuthClientProvider,
  ) {}

  private translate(error: unknown): never {
    if (
      error instanceof UnauthorizedError ||
      error instanceof McpPendingAuthorizationError ||
      (error instanceof StreamableHTTPError && error.code === 401)
    ) {
      throw new McpAuthRequiredError();
    }
    throw error;
  }

  private async connect(): Promise<Client> {
    if (this.session) return this.session.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = new Client({ name: "Houston", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        authProvider: this.authProvider,
      });
      transport.onclose = () => {
        if (this.session?.transport === transport) this.session = undefined;
      };
      await client.connect(transport);
      this.session = { client, transport };
      return client;
    })();
    try {
      return await this.connecting;
    } catch (error) {
      this.translate(error);
    } finally {
      this.connecting = undefined;
    }
  }

  async listTools(): Promise<Tools> {
    if (this.toolsCache && Date.now() - this.toolsCache.at < TOOLS_TTL_MS) {
      return this.toolsCache.tools;
    }
    try {
      const tools = (await (await this.connect()).listTools()).tools;
      this.toolsCache = { at: Date.now(), tools };
      return tools;
    } catch (error) {
      this.translate(error);
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpCallResult> {
    try {
      return (await (
        await this.connect()
      ).callTool({
        name,
        arguments: args,
      })) as McpCallResult;
    } catch (error) {
      this.translate(error);
    }
  }

  async close(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    this.toolsCache = undefined;
    await session?.client.close();
  }
}
