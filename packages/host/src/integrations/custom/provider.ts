import type { IntegrationProvider } from "../provider";
import type {
  ActionResult,
  Connection,
  ConnectStart,
  ProviderReadiness,
  Toolkit,
  ToolMatch,
  TriggerInstanceRef,
  TriggerType,
  TriggerUpsertBinding,
} from "../types";
import { IntegrationUpstreamError, TriggersUnsupportedError } from "../types";
import type { CustomExecutorHost } from "./executor-host";
import { searchCustomTools } from "./search";
import type { CustomIntegrationStore } from "./store";

/** Executor tool addresses are `tools.<integration>.<owner>.<connection>.<tool>`. */
export const CUSTOM_ACTION_PREFIX = "tools.";

/** Cap one action's runtime so a hung upstream can never wedge the turn
 *  (a stalled no-timeout call once held a workspace lock for hours). */
const EXECUTE_TIMEOUT_MS = 120_000;

/**
 * The `IntegrationProvider` adapter over the embedded executor engine — the
 * "custom" provider in the registry, beside Composio. Deployment-agnostic and
 * key-free: definitions + secrets live on this host's own disk, so it is ready
 * even signed-out and on installs with no Composio key.
 *
 * userId is accepted (port shape) but unused: the host's disk IS the single
 * user's space locally, and on managed cloud each agent pod belongs to exactly
 * one user.
 */
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

  /** Custom integrations are set up in chat, never via an OAuth redirect. */
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

  /** Disconnect = full removal, routed through the manager by the caller —
   *  the provider itself only knows the compiled view. */
  async disconnect(): Promise<void> {
    throw new IntegrationUpstreamError(400, {
      error: "remove custom integrations from the Integrations page",
      code: "custom_remove_via_manager",
    });
  }

  async search(_userId: string, query: string): Promise<ToolMatch[]> {
    const [defs, { executor }] = await Promise.all([
      this.store.list(),
      this.host.ensure(),
    ]);
    const tools = await executor.tools.list();
    return searchCustomTools(
      query,
      tools
        .filter((t) => t.integration !== "executor")
        .map((t) => ({
          address: t.address,
          integration: t.integration,
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      defs.map((d) => ({ slug: d.slug, name: d.name })),
    );
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
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Triggers (C9) ─────────────────────────────────────────────────────────
  // Custom OpenAPI/MCP sources have no event-trigger concept: a routine can only
  // wake on a Composio event, never on a user-added API. Every trigger verb
  // refuses, exactly like the desktop gateway adapter, so the reconciler and the
  // UI picker treat `custom` as trigger-less rather than half-supporting it.
  async listTriggerTypes(_toolkit: string): Promise<TriggerType[]> {
    throw new TriggersUnsupportedError(
      "custom integrations have no event triggers",
    );
  }
  async upsertTriggerInstance(
    _userId: string,
    _binding: TriggerUpsertBinding,
  ): Promise<TriggerInstanceRef> {
    throw new TriggersUnsupportedError(
      "custom integrations have no event triggers",
    );
  }
  async setTriggerInstanceStatus(
    _triggerInstanceId: string,
    _status: "enable" | "disable",
  ): Promise<void> {
    throw new TriggersUnsupportedError(
      "custom integrations have no event triggers",
    );
  }
  async deleteTriggerInstance(_triggerInstanceId: string): Promise<void> {
    throw new TriggersUnsupportedError(
      "custom integrations have no event triggers",
    );
  }
  async ensureWebhookSubscription(_webhookUrl: string): Promise<void> {
    throw new TriggersUnsupportedError(
      "custom integrations have no event triggers",
    );
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/**
 * The executor RESOLVES failed calls with `{ok:false, error}` instead of
 * throwing (verified live: a 401 upstream comes back ok:false). Map that onto
 * the port's ActionResult so the runtime tool's failure path — and its
 * recovery guidance — actually fires; and unwrap `{ok:true, data}` so the
 * model sees the payload, not the envelope.
 */
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
    // A rejected credential is recoverable in-chat: point the model at the
    // secure key-entry hand-off instead of the executor's own recovery text
    // (which names internal tools this runtime does not expose).
    const hint =
      category === "authentication"
        ? ` The saved key for '${action.split(".")[1] ?? ""}' seems invalid or expired - call request_credential with that toolkit so the user can enter a new one securely.`
        : "";
    return { successful: false, error: `${message}${hint}` };
  }
  if (isRecord(data) && data.ok === true && "data" in data) {
    return { successful: true, data: data.data };
  }
  return { successful: true, data };
}
