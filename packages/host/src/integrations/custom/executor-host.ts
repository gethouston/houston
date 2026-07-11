// The /core subpaths: the packages' root type entries are missing from the
// published dist (their promise.d.ts is not shipped), while the core entries
// are complete — and the promise-surface createExecutor consumes core-shaped
// plugins and promisifies their extensions itself (verified live).
import { mcpPlugin } from "@executor-js/plugin-mcp/core";
import { openApiPlugin } from "@executor-js/plugin-openapi/core";
import { createExecutor } from "@executor-js/sdk";
import { authMethodsOf, TOKEN_VARIABLE } from "./auth-methods";
import type { CustomSecretStore } from "./secrets";
import { HOUSTON_PROVIDER_KEY, houstonCredentialProvider } from "./secrets";
import type {
  CustomAuthMethod,
  CustomCredentialRef,
  CustomIntegrationDef,
  CustomIntegrationState,
} from "./types";

export { TOKEN_VARIABLE };

/**
 * The embedded executor engine: lifecycle + per-definition compilation.
 *
 * The executor is an IN-MEMORY compiled view — Houston's definitions/secrets
 * files are the only durable state. Built lazily on first use and rehydrated
 * from the definition list; a definition that fails to compile (spec URL down,
 * MCP server unreachable) degrades to state `error` for ITSELF only, and is
 * retried on the next rebuild — one broken source never takes down the rest.
 */

/** The promise-surface executor with both source plugins. */
export type CustomExecutor = Awaited<ReturnType<typeof buildExecutor>>;

function buildExecutor(secrets: CustomSecretStore) {
  return createExecutor({
    plugins: [openApiPlugin(), mcpPlugin()] as const,
    providers: [houstonCredentialProvider(secrets)],
    // Non-interactive host: a mid-call elicitation has no UI channel here.
    onElicitation: "accept-all",
  });
}

/** All custom connections are org-owned singletons named "default". */
const OWNER = "org";
const CONNECTION = "default";

export interface CompiledState {
  executor: CustomExecutor;
  /** Live per-slug state, refreshed by every (re)compile of that slug. */
  states: Map<string, CustomIntegrationState>;
}

export class CustomExecutorHost {
  private building: Promise<CompiledState> | null = null;

  constructor(
    private readonly secrets: CustomSecretStore,
    private readonly listDefs: () => Promise<CustomIntegrationDef[]>,
  ) {}

  /** The compiled engine, built once and rehydrated from the definitions. */
  ensure(): Promise<CompiledState> {
    this.building ??= this.build().catch((err) => {
      // A failed BUILD (not a failed definition) must not poison every later
      // call with the same stale rejection — drop it so the next call retries.
      this.building = null;
      throw err;
    });
    return this.building;
  }

  /** Drop the compiled view; the next call rebuilds from definitions. */
  async reset(): Promise<void> {
    const pending = this.building;
    this.building = null;
    if (pending) {
      const { executor } = await pending.catch(() => ({ executor: null }));
      if (executor) await executor.close();
    }
  }

  private async build(): Promise<CompiledState> {
    const executor = await buildExecutor(this.secrets);
    const states = new Map<string, CustomIntegrationState>();
    for (const def of await this.listDefs()) {
      states.set(def.slug, await this.compileDef(executor, def));
    }
    return { executor, states };
  }

  /**
   * Compile one definition into the executor: register its source, then attach
   * the connection its `auth` mode calls for. Returns the resulting state and
   * never throws — a compile failure IS a state.
   */
  async compileDef(
    executor: CustomExecutor,
    def: CustomIntegrationDef,
  ): Promise<CustomIntegrationState> {
    try {
      if (def.kind === "openapi") {
        await executor.openapi.addSpec({
          spec: def.spec,
          slug: def.slug,
          name: def.name,
          ...(def.baseUrl ? { baseUrl: def.baseUrl } : {}),
        });
      } else {
        await executor.mcp.addServer({
          transport: "remote",
          name: def.name,
          endpoint: def.endpoint,
          slug: def.slug,
          ...(def.headers ? { headers: def.headers } : {}),
          // A keyed MCP server needs a DECLARED auth method or the saved
          // credential has no placement: the token never reached a header, the
          // server 401'd every call, and even a valid key failed validation as
          // "expired". `Authorization: Bearer <token>` is the MCP spec's
          // scheme, so it is the default placement for credential-mode defs.
          ...(def.auth === "credential"
            ? {
                auth: {
                  kind: "header" as const,
                  headerName: "Authorization",
                  prefix: "Bearer ",
                },
              }
            : {}),
        });
      }
      if (def.auth === "credential" && !def.credential) {
        return {
          status: "pending",
          authMethods: await this.authMethods(executor, def.slug),
        };
      }
      await this.connect(executor, def.slug, def.credential);
      const toolCount = await this.toolCount(executor, def.slug);
      // `mcp.addServer` only records config — an unreachable server would
      // otherwise read as a healthy integration with zero tools. Zero tools on
      // an MCP def triggers a live probe to tell "no tools" from "no server";
      // a probe that reaches an auth wall still proves the server is there.
      if (def.kind === "mcp" && toolCount === 0) {
        const probe = await executor.mcp
          .probeEndpoint({
            endpoint: def.endpoint,
            ...(def.headers ? { headers: def.headers } : {}),
          })
          .catch(() => null);
        if (!probe || (!probe.connected && !probe.requiresAuthentication)) {
          return {
            status: "error",
            message: `the MCP server at ${def.endpoint} is not reachable`,
          };
        }
      }
      return { status: "active", toolCount };
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Attach the org connection: via stored secret refs, or template "none". */
  private async connect(
    executor: CustomExecutor,
    slug: string,
    credential: CustomCredentialRef | undefined,
  ): Promise<void> {
    if (credential) {
      const inputs = Object.fromEntries(
        Object.entries(credential.secretIds).map(([variable, id]) => [
          variable,
          { from: { provider: HOUSTON_PROVIDER_KEY, id } },
        ]),
      );
      await executor.connections.create({
        owner: OWNER,
        name: CONNECTION,
        integration: slug,
        template: credential.template,
        inputs,
      });
      return;
    }
    await executor.connections.create({
      owner: OWNER,
      name: CONNECTION,
      integration: slug,
      template: "none",
      value: "",
    });
  }

  /** Replace the org connection (credential updates re-wire in place). */
  async reconnect(
    executor: CustomExecutor,
    slug: string,
    credential: CustomCredentialRef,
  ): Promise<void> {
    const existing = await executor.connections.get({
      owner: OWNER,
      name: CONNECTION,
      integration: slug,
    });
    if (existing) {
      await executor.connections.remove({
        owner: OWNER,
        name: CONNECTION,
        integration: slug,
      });
    }
    await this.connect(executor, slug, credential);
  }

  async toolCount(executor: CustomExecutor, slug: string): Promise<number> {
    const tools = await executor.tools.list();
    return tools.filter((t) => t.integration === slug).length;
  }

  /** The integration's declared auth methods, reduced to collectible fields. */
  authMethods(
    executor: CustomExecutor,
    slug: string,
  ): Promise<CustomAuthMethod[]> {
    return authMethodsOf(executor, slug);
  }
}
