import { type AddCustomIntegrationInput, defFromAddInput } from "./add-input";
import { type DetectResult, detectSource } from "./detect";
import type { CustomExecutorHost } from "./executor-host";
import { TOKEN_VARIABLE } from "./executor-host";
import { CustomOAuthAttempts } from "./oauth-flow";
import { completeOAuthOp, startOAuthOp } from "./oauth-ops";
import type { CustomSecretStore } from "./secrets";
import { secretIdFor } from "./secrets";
import { sameServiceOrigins } from "./service-origins";
import { slugify } from "./slug";
import type { CustomIntegrationStore } from "./store";
import { toolsOf } from "./tools";
import type {
  CustomIntegrationDef,
  CustomIntegrationView,
  CustomToolInfo,
} from "./types";
import { CUSTOM_SLUG, CustomIntegrationError } from "./types";
import { viewOf } from "./views";

export type { AddCustomIntegrationInput, DetectResult };

/**
 * Management ops over definitions + the compiled engine. Every mutation
 * persists FIRST (definitions are the durable truth), then updates the live
 * executor, then notifies (`onChanged` → HoustonEvent → UI invalidation).
 */
export class CustomIntegrationManager {
  /** Mutations run one at a time: every write spans three stores (defs,
   *  secrets, the compiled executor) plus the state map, and an interleaved
   *  replace/remove/setCredential pair can otherwise leave them pointing at
   *  different worlds (a def whose secret was deleted, an executor without
   *  the integration the store says is active). Reads stay concurrent. */
  private mutations: Promise<unknown> = Promise.resolve();

  private readonly attempts = new CustomOAuthAttempts();

  constructor(
    private readonly store: CustomIntegrationStore,
    private readonly secrets: CustomSecretStore,
    private readonly host: CustomExecutorHost,
    private readonly onChanged: () => void,
    /** OAuth sign-in (PRODUCT-1172): the browser-reachable callback URL —
     *  absent on deployments that cannot receive the redirect — and a fetch
     *  seam for tests. */
    private readonly oauth: {
      callbackUrl?: string;
      fetchFn?: typeof fetch;
    } = {},
  ) {}

  private oauthDeps() {
    return {
      store: this.store,
      secrets: this.secrets,
      host: this.host,
      attempts: this.attempts,
      ...this.oauth,
      onChanged: this.onChanged,
    };
  }

  /** Whether this deployment can run the browser sign-in at all. */
  get oauthSupported(): boolean {
    return this.oauth.callbackUrl !== undefined;
  }

  /** Mint the authorize URL for one MCP integration's sign-in. In-memory
   *  attempt only — nothing durable moves until the callback lands. */
  async startOAuth(slug: string): Promise<{ authorizeUrl: string }> {
    return startOAuthOp(this.oauthDeps(), await this.defOr404(slug));
  }

  /** The callback's landing: exchange the code, persist the token bundle,
   *  wire the connection. Serialized like every other mutation. */
  completeOAuth(state: string, code: string): Promise<CustomIntegrationView> {
    return this.serialize(() =>
      completeOAuthOp(
        this.oauthDeps(),
        (slug) => this.defOr404(slug),
        state,
        code,
      ),
    );
  }

  private serialize<T>(op: () => Promise<T>): Promise<T> {
    const run = this.mutations.then(op, op);
    this.mutations = run.catch(() => undefined);
    return run;
  }

  async list(): Promise<CustomIntegrationView[]> {
    const [defs, { executor, states }] = await Promise.all([
      this.store.list(),
      this.host.ensure(),
    ]);
    return Promise.all(
      defs.map(async (def) =>
        viewOf(
          def,
          states.get(def.slug) ?? { status: "error", message: "not compiled" },
          await this.host.authMethods(executor, def.slug).catch(() => []),
        ),
      ),
    );
  }

  async detect(url: string): Promise<DetectResult> {
    const { executor } = await this.host.ensure();
    const result = await detectSource(executor, url);
    // An OAuth wall is only actionable where this deployment can actually
    // run the browser sign-in — the agent/UI branch on this, not on guesses.
    return result.requiresOAuth
      ? { ...result, oauthSupported: this.oauthSupported }
      : result;
  }

  /** The compiled tools behind one integration (the detail card's list).
   *  A pending/errored definition simply has none compiled yet. */
  async tools(slug: string): Promise<CustomToolInfo[]> {
    await this.defOr404(slug);
    const { executor } = await this.host.ensure();
    return toolsOf(executor, slug);
  }

  add(input: AddCustomIntegrationInput): Promise<CustomIntegrationView> {
    return this.serialize(() => this.addLocked(input));
  }

  private async addLocked(
    input: AddCustomIntegrationInput,
  ): Promise<CustomIntegrationView> {
    const slug = input.slug ?? slugify(input.name);
    if (!CUSTOM_SLUG.test(slug)) {
      throw new CustomIntegrationError(
        "invalid_slug",
        `invalid slug '${slug}'`,
      );
    }
    // The capability gate is authoritative HERE, not just advisory in the
    // UI/agent: a deployment that cannot receive the browser redirect must
    // never accumulate pending-oauth definitions whose one affordance can
    // only fail (managed pods until the gateway callback ships).
    if (input.auth === "oauth" && !this.oauthSupported) {
      throw new CustomIntegrationError(
        "oauth_unsupported",
        "signing in with this service is not available on this Houston deployment yet",
      );
    }
    // The executor's own internal toolbox lives under the reserved
    // integration id "executor" — a user definition with that slug would
    // collide inside the engine and leak engine-internal tools into
    // counts/lists (the store's duplicate check cannot see it).
    if (slug === "executor") {
      throw new CustomIntegrationError(
        "invalid_slug",
        "'executor' is a reserved name; pick another",
      );
    }
    const defs = await this.store.list();
    const existing = defs.find((d) => d.slug === slug);
    if (existing && !input.replace) {
      throw new CustomIntegrationError(
        "duplicate_slug",
        `a custom integration named '${slug}' already exists`,
      );
    }
    if (existing && existing.kind !== input.kind) {
      throw new CustomIntegrationError(
        "duplicate_slug",
        `'${slug}' already exists as a different kind; remove it first`,
      );
    }
    let def = defFromAddInput(input, slug);
    if (existing) {
      // An in-place spec swap, not a new integration: the added date
      // survives, and the saved credential survives ONLY when the
      // replacement provably talks to the same service — a spec that moves
      // (or hides) its servers must never inherit the key, or a bad actor
      // could point it at their own host and collect it. A dropped carry
      // lands the def `pending`; the key is re-collected via the secure card.
      // Within the same service the carry ignores the input's `auth`: replace
      // is spec-repair, and the caller is a model re-deriving `auth` on every
      // call — a sloppy `"none"` replay must not silently discard a working
      // key (the promised semantics are "the key survives").
      const keepCredential =
        existing.credential !== undefined && sameServiceOrigins(existing, def);
      def = {
        ...def,
        addedAtMs: existing.addedAtMs,
        ...(keepCredential
          ? // The carried auth mode is the EXISTING one (a signed-in oauth
            // def stays oauth; a keyed one stays credential) — replace is
            // spec-repair, never an auth downgrade.
            { auth: existing.auth, credential: existing.credential }
          : {}),
      };
    }
    const { executor, states } = await this.host.ensure();
    // The proven refresh sequence: tear down the compiled view, recompile —
    // connection included (see CustomExecutorHost.refreshSpecs).
    if (existing) await this.host.uncompileDef(executor, existing);
    const state = await this.host.compileDef(executor, def);
    if (state.status === "error") {
      // A failed replacement must not cost a working integration: clear
      // whatever the failed compile managed to register (an addSpec that
      // succeeded before the connection step failed would otherwise occupy
      // the slug), then put the previous compiled view back.
      await this.host.uncompileDef(executor, def);
      if (existing) {
        states.set(slug, await this.host.compileDef(executor, existing));
      }
      // Never persist a definition that cannot compile — the add FAILED and
      // the agent gets the real reason to relay/fix (wrong URL, server down).
      throw new CustomIntegrationError("compile_failed", state.message);
    }
    // The replacement no longer references the old secrets (the carry was
    // refused because the service moved): delete them now, while the old def
    // still names them — after the put nothing else ever would.
    for (const id of Object.values(existing?.credential?.secretIds ?? {})) {
      if (!Object.values(def.credential?.secretIds ?? {}).includes(id)) {
        await this.secrets.delete(id);
      }
    }
    await this.store.put(def);
    states.set(slug, state);
    this.onChanged();
    return viewOf(
      def,
      state,
      await this.host.authMethods(executor, slug).catch(() => []),
    );
  }

  /** Store the user's secret and wire the connection; validates first. */
  setCredential(
    slug: string,
    values: Record<string, string>,
  ): Promise<CustomIntegrationView> {
    return this.serialize(() => this.setCredentialLocked(slug, values));
  }

  private async setCredentialLocked(
    slug: string,
    values: Record<string, string>,
  ): Promise<CustomIntegrationView> {
    const def = await this.defOr404(slug);
    const { executor, states } = await this.host.ensure();
    // Providing a key IS declaring the service needs one: heal an OpenAPI def
    // with no collectible method (spec without a security scheme) instead of
    // dead-ending the save — covers defs added as `auth: "none"` too, which
    // compileDef's own ensure call never sees.
    await this.host.ensureCollectibleAuth(executor, def);
    const methods = await this.host.authMethods(executor, slug);
    const method = methods[0];
    if (!method) {
      const state = states.get(slug);
      throw new CustomIntegrationError(
        "credential_invalid",
        state?.status === "error"
          ? `'${slug}' is not working right now (${state.message}), so the key cannot be saved. Fix or re-add the integration first.`
          : `'${slug}' does not say where an API key goes. Remove it and add it again as a service that needs a key.`,
      );
    }
    const token = values[TOKEN_VARIABLE] ?? Object.values(values)[0];
    if (!token?.trim()) {
      throw new CustomIntegrationError(
        "credential_invalid",
        "the credential value is empty",
      );
    }
    // Key-first validation is ADVISORY, never a gate: the declared placement
    // is a per-service guess (an MCP server may want a different header than
    // the standard Bearer), so a failed probe with a REAL key would otherwise
    // hard-block saving with no path forward. The verdict rides the returned
    // view as `verified` so the UI picks confirmation vs warning copy; a
    // genuinely bad key still surfaces on first use, where the execute
    // failure carries the request_credential recovery hint.
    const verdict = await executor.connections
      .validate({
        owner: "org",
        integration: slug,
        template: method.template,
        values: { [TOKEN_VARIABLE]: token },
      })
      .catch(() => null);
    const verified =
      verdict?.status === "healthy"
        ? true
        : verdict?.status === "expired" || verdict?.status === "degraded"
          ? false
          : undefined;

    const secretId = secretIdFor(slug, TOKEN_VARIABLE);
    await this.secrets.set(secretId, token);
    const credential = {
      template: method.template,
      secretIds: { [TOKEN_VARIABLE]: secretId },
    };
    const updated: CustomIntegrationDef = {
      ...def,
      auth: "credential",
      credential,
    };
    await this.store.put(updated);
    await this.host.reconnect(executor, slug, credential);
    const state = {
      status: "active" as const,
      toolCount: await this.host.toolCount(executor, slug),
    };
    states.set(slug, state);
    this.onChanged();
    return {
      ...viewOf(updated, state, methods),
      ...(verified !== undefined ? { verified } : {}),
    };
  }

  remove(slug: string): Promise<void> {
    return this.serialize(() => this.removeLocked(slug));
  }

  private async removeLocked(slug: string): Promise<void> {
    const def = await this.defOr404(slug);
    await this.store.remove(slug);
    for (const id of Object.values(def.credential?.secretIds ?? {})) {
      await this.secrets.delete(id);
    }
    const { executor, states } = await this.host.ensure();
    states.delete(slug);
    if (def.kind === "openapi") {
      await executor.openapi.removeSpec(slug).catch(() => undefined);
    } else {
      await executor.mcp.removeServer(slug).catch(() => undefined);
    }
    this.onChanged();
  }

  private async defOr404(slug: string): Promise<CustomIntegrationDef> {
    const def = (await this.store.list()).find((d) => d.slug === slug);
    if (!def) {
      throw new CustomIntegrationError(
        "not_found",
        `no custom integration '${slug}'`,
      );
    }
    return def;
  }
}
