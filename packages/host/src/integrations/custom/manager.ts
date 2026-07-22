import { type AddCustomIntegrationInput, defFromAddInput } from "./add-input";
import { type DetectResult, detectSource } from "./detect";
import type { CustomExecutorHost } from "./executor-host";
import { TOKEN_VARIABLE } from "./executor-host";
import type { CustomSecretStore } from "./secrets";
import { secretIdFor } from "./secrets";
import { slugify } from "./slug";
import type { CustomIntegrationStore } from "./store";
import type { CustomIntegrationDef, CustomIntegrationView } from "./types";
import { CUSTOM_SLUG, CustomIntegrationError } from "./types";
import { viewOf } from "./views";

export type { AddCustomIntegrationInput, DetectResult };

/**
 * Management ops over definitions + the compiled engine. Every mutation
 * persists FIRST (definitions are the durable truth), then updates the live
 * executor, then notifies (`onChanged` → HoustonEvent → UI invalidation).
 */
export class CustomIntegrationManager {
  constructor(
    private readonly store: CustomIntegrationStore,
    private readonly secrets: CustomSecretStore,
    private readonly host: CustomExecutorHost,
    private readonly onChanged: () => void,
  ) {}

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
    return detectSource(executor, url);
  }

  async add(input: AddCustomIntegrationInput): Promise<CustomIntegrationView> {
    const slug = input.slug ?? slugify(input.name);
    if (!CUSTOM_SLUG.test(slug)) {
      throw new CustomIntegrationError(
        "invalid_slug",
        `invalid slug '${slug}'`,
      );
    }
    const defs = await this.store.list();
    if (defs.some((d) => d.slug === slug)) {
      throw new CustomIntegrationError(
        "duplicate_slug",
        `a custom integration named '${slug}' already exists`,
      );
    }
    const def = defFromAddInput(input, slug);
    const { executor, states } = await this.host.ensure();
    const state = await this.host.compileDef(executor, def);
    if (state.status === "error") {
      // Never persist a definition that cannot compile — the add FAILED and
      // the agent gets the real reason to relay/fix (wrong URL, server down).
      throw new CustomIntegrationError("compile_failed", state.message);
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
  async setCredential(
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

  async remove(slug: string): Promise<void> {
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
