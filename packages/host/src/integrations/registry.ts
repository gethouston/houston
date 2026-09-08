import type { IntegrationProviderId } from "@houston/protocol";
import type { IntegrationProvider } from "./provider";

/**
 * The set of integration providers wired into a deployment. Keyed by id so the
 * host can resolve the right adapter for a stored credential (cred.provider) or
 * a UI request. Today it's just Composio; a second provider registers here and
 * everything above the port keeps working unchanged.
 *
 * An empty registry is valid (a deployment with integrations turned off — the
 * /v1/capabilities `integrations` flag is then false and the routes 404/503).
 */
export class IntegrationRegistry {
  private readonly byId = new Map<IntegrationProviderId, IntegrationProvider>();

  constructor(providers: IntegrationProvider[] = []) {
    for (const p of providers) this.register(p);
  }

  /** Register a provider. Duplicate ids are a wiring bug, not a silent overwrite. */
  register(provider: IntegrationProvider): void {
    if (this.byId.has(provider.id)) {
      throw new Error(
        `integration provider '${provider.id}' already registered`,
      );
    }
    this.byId.set(provider.id, provider);
  }

  /** Resolve a provider by id; throws (never returns undefined) on an unknown id. */
  get(id: IntegrationProviderId): IntegrationProvider {
    const provider = this.byId.get(id);
    if (!provider) throw new Error(`unknown integration provider '${id}'`);
    return provider;
  }

  /** Narrows an untrusted string (a path segment, a request body) to a provider
   *  this deployment actually registered. */
  has(id: string): id is IntegrationProviderId {
    return this.byId.has(id as IntegrationProviderId);
  }

  /** Registered provider ids (for capabilities / a provider picker). */
  ids(): IntegrationProviderId[] {
    return [...this.byId.keys()];
  }

  get size(): number {
    return this.byId.size;
  }
}
