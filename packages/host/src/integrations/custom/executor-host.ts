import { createHash } from "node:crypto";
// The /core subpaths: the packages' root type entries are missing from the
// published dist (their promise.d.ts is not shipped), while the core entries
// are complete — and the promise-surface createExecutor consumes core-shaped
// plugins and promisifies their extensions itself (verified live).
import { mcpPlugin } from "@executor-js/plugin-mcp/core";
import { openApiPlugin } from "@executor-js/plugin-openapi/core";
import { createExecutor } from "@executor-js/sdk";
import { authMethodsOf, TOKEN_VARIABLE } from "./auth-methods";
import { fallbackAuthTemplate } from "./fallback-auth";
import { guardedFetch, guardedHttpClientLayer } from "./fetch-guard";
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
    // Own the HTTP seam instead of inheriting process-global fetch state —
    // see fetch-guard.ts for the POST-killing header-duplication this ends.
    httpClientLayer: guardedHttpClientLayer(),
    fetch: guardedFetch,
  });
}

/** All custom connections are org-owned singletons named "default". */
const OWNER = "org";
const CONNECTION = "default";

/**
 * How stale a URL-sourced OpenAPI spec's compiled view may grow before use
 * triggers a background verify (HOU-1052 follow-up). The compiled view is
 * in-memory and otherwise lives as long as the host process — hours on a
 * cloud pod, potentially WEEKS on a desktop install — while the service's
 * API description can change under it. Blob specs are frozen by design
 * (the agent authored them) and MCP tool lists are discovered live, so
 * only url-kind OpenAPI defs are ever refreshed.
 */
const SPEC_REFRESH_TTL_MS = 6 * 60 * 60 * 1000;

/** Fetch the spec text, or `null` when unreachable/non-2xx — the caller
 *  keeps the WORKING compiled view rather than downgrading on an outage. */
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
  /** Live per-slug state, refreshed by every (re)compile of that slug. */
  states: Map<string, CustomIntegrationState>;
}

export class CustomExecutorHost {
  private building: Promise<CompiledState> | null = null;
  /** When the url-sourced specs were last VERIFIED against their sources.
   *  0 = never built, which also gates the refresh kick until a build lands. */
  private lastSpecCheckAt = 0;
  /** sha256 of each url-spec's last-seen content; a def with no entry gets a
   *  baseline recorded on its first verify instead of a blind recompile. */
  private readonly specHashes = new Map<string, string>();
  private refreshing: Promise<void> | null = null;

  constructor(
    private readonly secrets: CustomSecretStore,
    private readonly listDefs: () => Promise<CustomIntegrationDef[]>,
    private readonly specRefreshTtlMs: number = SPEC_REFRESH_TTL_MS,
  ) {}

  /** The compiled engine, built once and rehydrated from the definitions.
   *  Every use also arms the stale-spec verify (background, never blocking:
   *  a chat turn must not wait on a spec re-fetch). */
  ensure(): Promise<CompiledState> {
    const built = this.ensureBuilt();
    this.maybeRefreshSpecs();
    return built;
  }

  private ensureBuilt(): Promise<CompiledState> {
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
    // The specs were just compiled from source: the verify clock starts now.
    this.lastSpecCheckAt = Date.now();
    return { executor, states };
  }

  /** Arm one background refresh when the TTL has lapsed. The window is
   *  claimed up front so racing ensure() calls never stack refreshes, and a
   *  failed sweep simply waits out the next TTL (the view keeps working). */
  private maybeRefreshSpecs(): void {
    if (this.refreshing || this.lastSpecCheckAt === 0) return;
    if (Date.now() - this.lastSpecCheckAt < this.specRefreshTtlMs) return;
    this.lastSpecCheckAt = Date.now();
    this.refreshing = this.refreshSpecs()
      .catch((err) => {
        // Background maintenance with no user action to toast on — the
        // compiled view stays as it was, so log-and-wait is the honest move.
        console.error("[custom-integrations] spec refresh failed", err);
      })
      .finally(() => {
        this.refreshing = null;
      });
  }

  /**
   * Verify-then-recompile for every url-sourced OpenAPI def (HOU-1052
   * follow-up): re-fetch the spec, and only when its CONTENT actually changed
   * (sha256) tear down and recompile that one definition — the same
   * removeSpec + compileDef sequence a remove + re-add runs, connection
   * included. An unreachable spec host keeps the working view untouched; a
   * def seen for the first time records its baseline hash without a blind
   * recompile (the boot compile is at most one TTL old). Awaitable directly
   * (tests, a future manual Refresh affordance); `ensure()` runs it in the
   * background on the TTL.
   */
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
          // scheme, so it is the default placement for credential-mode defs —
          // and for oauth-mode ones, whose access token rides the same header
          // (the credential provider serves the CURRENT token per request).
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
        // BEFORE the pending/connect fork: a pending def's card needs the
        // (possibly synthesized) fields, and a stored credential's template
        // must exist before connections.create renders through it.
        await this.ensureCollectibleAuth(executor, def);
      }
      if (def.auth !== "none" && !def.credential) {
        // Waiting on the user: a key for credential mode, a browser sign-in
        // for oauth mode (the view's `auth` picks the affordance).
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
        // An auth wall on a def added WITHOUT a credential can never produce
        // tools — reporting it "active, 0 actions" would bury the real
        // problem (the reviewed OAuth-only case: the server wants its own
        // sign-in, which Houston cannot connect to yet).
        if (probe.requiresAuthentication && def.auth === "none") {
          return {
            status: "error",
            message: probe.requiresOAuth
              ? `the MCP server at ${def.endpoint} only signs in with its own account flow, which Houston cannot connect to yet`
              : `the MCP server at ${def.endpoint} requires an API key or token - add it again as a service that needs a key`,
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

  /** Tear one definition's compiled view out of the engine (the first half
   *  of the replace/refresh sequence; compileDef rebuilds it, connection
   *  included). Absence is fine — an errored def never compiled. */
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

  /**
   * A compiled OpenAPI integration with NO collectible auth method (a spec
   * that models its key as a plain header parameter, or declares no auth at
   * all) would dead-end the secure credential save: the key has nowhere to
   * go, so `setCredential` could only fail — the reported PriceLabs bug,
   * where the secure card errored on every attempt while pasting the key in
   * chat worked. Synthesize a stable fallback method from the spec's own
   * api-key-shaped parameter (else `Authorization: Bearer`, the MCP path's
   * default). The executor is an in-memory view, so every rebuild re-injects
   * the same `houston_fallback` template; a def whose stored credential
   * references it therefore reconnects across restarts. No-op when the
   * integration failed to compile or already declares a collectible method.
   */
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

  /** The integration's declared auth methods, reduced to collectible fields. */
  authMethods(
    executor: CustomExecutor,
    slug: string,
  ): Promise<CustomAuthMethod[]> {
    return authMethodsOf(executor, slug);
  }
}
