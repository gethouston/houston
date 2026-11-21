import type {
  ActingContext,
  IntegrationProvider,
  ProviderSearchResult,
} from "../provider";
import type {
  ActionResult,
  Connection,
  ConnectStart,
  ProviderReadiness,
  Toolkit,
} from "../types";
import { IntegrationUpstreamError } from "../types";
import { looksLikeAuthFailure } from "./auth-failure";
import type { CustomExecutorHost } from "./executor-host";
import { searchCustomTools } from "./search";
import type { CustomIntegrationStore } from "./store";
import { attachToolParams } from "./tool-params";

export const CUSTOM_ACTION_PREFIX = "tools.";

const EXECUTE_TIMEOUT_MS = 120_000;

export class CustomIntegrationProvider implements IntegrationProvider {
  readonly id = "custom";

  constructor(
    private readonly store: CustomIntegrationStore,
    private readonly host: CustomExecutorHost,
  ) {}

  async readiness(): Promise<ProviderReadiness> {
    return { ready: true };
  }

  async listToolkits(): Promise<Toolkit[]> {
    const defs = await this.store.list();
    return defs.map((def) => ({
      slug: def.slug,
      name: def.name,
      description:
        def.kind === "openapi" ? "Custom API integration" : "Custom MCP server",
      categories: ["custom"],
    }));
  }

  async listConnections(): Promise<Connection[]> {
    const [defs, { states }] = await Promise.all([
      this.store.list(),
      this.host.ensure(),
    ]);
    return defs.map((def) => {
      const state = states.get(def.slug);
      return {
        toolkit: def.slug,
        connectionId: def.slug,
        status:
          state?.status === "active"
            ? ("active" as const)
            : state?.status === "pending"
              ? ("pending" as const)
              : ("error" as const),
      };
    });
  }

  async connect(): Promise<ConnectStart> {
    throw new IntegrationUpstreamError(400, {
      error: "custom integrations are set up from a chat with your agent",
      code: "custom_connect_via_chat",
    });
  }

  async connection(
    _userId: string,
    connectionId: string,
  ): Promise<Connection | null> {
    const all = await this.listConnections();
    return all.find((c) => c.connectionId === connectionId) ?? null;
  }

  async disconnect(): Promise<void> {
    throw new IntegrationUpstreamError(400, {
      error: "remove custom integrations from the Integrations page",
      code: "custom_remove_via_manager",
    });
  }

  async search(
    _userId: string,
    query: string,
    _acting?: ActingContext,
    app?: string,
  ): Promise<ProviderSearchResult> {
    const [defs, { executor, states }] = await Promise.all([
      this.store.list(),
      this.host.ensure(),
    ]);
    const tools = await executor.tools.list();
    const result = searchCustomTools(
      query,
      tools
        .filter((t) => t.integration !== "executor")
        .map((t) => ({
          address: t.address,
          integration: t.integration,
          name: t.name,
          description: t.description,
        })),
      defs.map((d) => ({
        slug: d.slug,
        name: d.name,
        active: states.get(d.slug)?.status === "active",
      })),
      app,
    );
    return {
      ...result,
      items: await attachToolParams(result.items, (address) =>
        executor.tools.schema(address),
      ),
    };
  }

  async execute(
    _userId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult> {
    const { executor } = await this.host.ensure();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `the action did not respond within ${EXECUTE_TIMEOUT_MS / 1000}s`,
            ),
          ),
        EXECUTE_TIMEOUT_MS,
      );
    });
    try {
      const data = await Promise.race([
        executor.execute(action, params),
        timeout,
      ]);
      return unwrapExecutorResult(action, data);
    } catch (err) {
      return {
        successful: false,
        error: describeExecuteError(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const DROPPED_CONNECTION =
  /other side closed|socket hang up|ECONNRESET|EPIPE|UND_ERR_SOCKET/i;

export function describeExecuteError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 6 && isRecord(current); depth++) {
    const message =
      typeof current.message === "string" ? current.message.trim() : "";
    const code = typeof current.code === "string" ? current.code : "";
    const part = message
      ? code && !message.includes(code)
        ? `${message} (${code})`
        : message
      : code;
    if (part && parts[parts.length - 1] !== part) parts.push(part);
    current = current.cause;
  }
  if (parts.length === 0) return String(err);
  const composed = parts.join(": ");
  return DROPPED_CONNECTION.test(composed)
    ? `${composed}. The connection dropped mid-request - this is usually transient, so if this action is safe to repeat, retry it once before reporting a failure.`
    : composed;
}

export function unwrapExecutorResult(
  action: string,
  data: unknown,
): ActionResult {
  if (isRecord(data) && data.ok === false) {
    const err = data.error;
    const message = isRecord(err)
      ? typeof err.message === "string"
        ? err.message
        : JSON.stringify(err)
      : String(err ?? "the action failed");
    const category = isRecord(err)
      ? (err.details as { category?: string } | undefined)?.category
      : undefined;
    const rejected =
      category === "authentication" ||
      (isRecord(err) &&
        err.code === "mcp_tool_error" &&
        looksLikeAuthFailure(message));
    const hint = rejected
      ? ` The saved key for '${action.split(".")[1] ?? ""}' seems invalid or expired - call request_credential with that toolkit so the user can enter a new one securely.`
      : "";
    return { successful: false, error: `${message}${hint}` };
  }
  if (isRecord(data) && data.ok === true && "data" in data) {
    return { successful: true, data: data.data };
  }
  return { successful: true, data };
}
