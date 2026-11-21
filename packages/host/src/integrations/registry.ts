import type { IntegrationProviderId } from "@houston/protocol";
import type { IntegrationProvider } from "./provider";

export class IntegrationRegistry {
  private readonly byId = new Map<IntegrationProviderId, IntegrationProvider>();

  constructor(providers: IntegrationProvider[] = []) {
    for (const p of providers) this.register(p);
  }

  register(provider: IntegrationProvider): void {
    if (this.byId.has(provider.id)) {
      throw new Error(
        `integration provider '${provider.id}' already registered`,
      );
    }
    this.byId.set(provider.id, provider);
  }

  get(id: IntegrationProviderId): IntegrationProvider {
    const provider = this.byId.get(id);
    if (!provider) throw new Error(`unknown integration provider '${id}'`);
    return provider;
  }

  has(id: string): id is IntegrationProviderId {
    return this.byId.has(id as IntegrationProviderId);
  }

  ids(): IntegrationProviderId[] {
    return [...this.byId.keys()];
  }

  get size(): number {
    return this.byId.size;
  }
}
