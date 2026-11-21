import { createHash } from "node:crypto";
import { mcpPlugin } from "@executor-js/plugin-mcp/core";
import { openApiPlugin } from "@executor-js/plugin-openapi/core";
import { createExecutor } from "@executor-js/sdk";
import { authMethodsOf, TOKEN_VARIABLE } from "./auth-methods";
import { fallbackAuthTemplate } from "./fallback-auth";
import { guardedFetch, guardedHttpClientLayer } from "./fetch-guard";
import { advertisesOAuth } from "./oauth-discovery";
import type { CustomSecretStore } from "./secrets";
import {
  HOUSTON_PROVIDER_KEY,
  houstonCredentialProvider,
  resolveCredentialValue,
} from "./secrets";
import type {
  CustomAuthMethod,
  CustomCredentialRef,
  CustomIntegrationDef,
  CustomIntegrationState,
} from "./types";

export { TOKEN_VARIABLE };

export type CustomExecutor = Awaited<ReturnType<typeof buildExecutor>>;

function buildExecutor(secrets: CustomSecretStore) {
  return createExecutor({
    plugins: [openApiPlugin(), mcpPlugin()] as const,
    providers: [houstonCredentialProvider(secrets)],
    onElicitation: "accept-all",
    httpClientLayer: guardedHttpClientLayer(),
    fetch: guardedFetch,
  });
}

const OWNER = "org";
const CONNECTION = "default";

const SPEC_REFRESH_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchSpecText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export interface CompiledState {
  executor: CustomExecutor;
  states: Map<string, CustomIntegrationState>;
}

export class CustomExecutorHost {
  private building: Promise<CompiledState> | null = null;
  private lastSpecCheckAt = 0;
  private readonly specHashes = new Map<string, string>();
  private refreshing: Promise<void> | null = null;

  constructor(
    private readonly secrets: CustomSecretStore,
    private readonly listDefs: () => Promise<CustomIntegrationDef[]>,
    private readonly specRefreshTtlMs: number = SPEC_REFRESH_TTL_MS,
  ) {}

  ensure(): Promise<CompiledState> {
    const built = this.ensureBuilt();
    this.maybeRefreshSpecs();
    return built;
  }

  private ensureBuilt(): Promise<CompiledState> {
    this.building ??= this.build().catch((err) => {
      this.building = null;
      throw err;
    });
    return this.building;
  }

  async reset(): Promise<void> {
    const pending = this.building;
    this.building = null;
    this.lastSpecCheckAt = 0;
    this.specHashes.clear();
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
    this.lastSpecCheckAt = Date.now();
    return { executor, states };
  }

  private maybeRefreshSpecs(): void {
    if (this.refreshing || this.lastSpecCheckAt === 0) return;
    if (Date.now() - this.lastSpecCheckAt < this.specRefreshTtlMs) return;
    this.lastSpecCheckAt = Date.now();
    this.refreshing = this.refreshSpecs()
      .catch((err) => {
        console.error("[custom-integrations] spec refresh failed", err);
      })
      .finally(() => {
        this.refreshing = null;
      });
  }

  async refreshSpecs(): Promise<void> {
    const { executor, states } = await this.ensureBuilt();
    for (const def of await this.listDefs()) {
      if (def.kind !== "openapi" || def.spec.kind !== "url") continue;
      const text = await fetchSpecText(def.spec.url);
      if (text === null) continue;
      const hash = createHash("sha256").update(text).digest("hex");
      const prev = this.specHashes.get(def.slug);
      this.specHashes.set(def.slug, hash);
      if (prev === undefined || prev === hash) continue;
      await executor.openapi.removeSpec(def.slug).catch(() => undefined);
      states.set(def.slug, await this.compileDef(executor, def));
      console.info(
        `[custom-integrations] '${def.slug}' spec changed upstream - recompiled`,
      );
    }
  }

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
          ...(def.auth !== "none"
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
      if (def.kind === "openapi" && def.auth === "credential") {
        await this.ensureCollectibleAuth(executor, def);
      }
      if (def.auth !== "none" && !def.credential) {
        return {
          status: "pending",
          authMethods: await this.authMethods(executor, def.slug),
        };
      }
      await this.connect(executor, def.slug, def.credential);
      return await this.connectedState(executor, def);
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async connectedState(
    executor: CustomExecutor,
    def: CustomIntegrationDef,
  ): Promise<CustomIntegrationState> {
    const toolCount = await this.toolCount(executor, def.slug);
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
      if (probe.requiresAuthentication && def.auth === "none") {
        const oauth =
          probe.requiresOAuth ||
          (await advertisesOAuth(def.endpoint, guardedFetch, def.headers));
        return {
          status: "error",
          message: oauth
            ? `the MCP server at ${def.endpoint} only signs in with its own account flow - add it again as a service you sign in to`
            : `the MCP server at ${def.endpoint} requires an API key or token - add it again as a service that needs a key`,
        };
      }
      if (probe.requiresAuthentication && def.credential) {
        const verdict = await this.credentialVerdict(
          executor,
          def.slug,
          def.credential,
        );
        if (verdict === "rejected") {
          return {
            status: "pending",
            authMethods: await this.authMethods(executor, def.slug),
          };
        }
        if (verdict === "unavailable") {
          return {
            status: "error",
            message: `the saved sign-in for ${def.name} cannot be checked right now - try again in a moment`,
          };
        }
      }
    }
    return { status: "active", toolCount };
  }

  private async credentialVerdict(
    executor: CustomExecutor,
    slug: string,
    credential: CustomCredentialRef,
  ): Promise<"ok" | "rejected" | "unavailable"> {
    try {
      const values: Record<string, string> = {};
      for (const [variable, id] of Object.entries(credential.secretIds)) {
        const value = await resolveCredentialValue(this.secrets, id);
        if (value === null) return "rejected";
        values[variable] = value;
      }
      const verdict = await executor.connections.validate({
        owner: OWNER,
        integration: slug,
        template: credential.template,
        values,
      });
      return verdict.status === "expired" || verdict.status === "degraded"
        ? "rejected"
        : "ok";
    } catch {
      return "unavailable";
    }
  }

  async uncompileDef(
    executor: CustomExecutor,
    def: CustomIntegrationDef,
  ): Promise<void> {
    if (def.kind === "openapi") {
      await executor.openapi.removeSpec(def.slug).catch(() => undefined);
    } else {
      await executor.mcp.removeServer(def.slug).catch(() => undefined);
    }
  }

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

  async ensureCollectibleAuth(
    executor: CustomExecutor,
    def: CustomIntegrationDef,
  ): Promise<void> {
    if (def.kind !== "openapi") return;
    const integration = await executor.integrations.get(def.slug);
    if (!integration) return;
    const methods = integration.authMethods ?? [];
    if (methods.some((m) => m.kind !== "oauth")) return;
    await executor.openapi.configure(def.slug, {
      authenticationTemplate: [fallbackAuthTemplate(def)],
      mode: "merge",
    });
  }

  authMethods(
    executor: CustomExecutor,
    slug: string,
  ): Promise<CustomAuthMethod[]> {
    return authMethodsOf(executor, slug);
  }
}
