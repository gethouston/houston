import type {
  ProviderStatus,
  ProviderUsage,
} from "../../../../../ui/engine-client/src/types";
import { toNewProvider } from "../synthetic";
import type { BaseCtor } from "./mixin";

export function ProviderStatusMixin<TBase extends BaseCtor>(Base: TBase) {
  // Internal label only (the exported factory is the contract). Named to avoid
  // shadowing the imported ui `ProviderStatus` type the verbatim bodies return.
  class ProviderStatusMethods extends Base {
    async providerStatus(name: string): Promise<ProviderStatus> {
      return (await this.providerStatuses([name]))[0];
    }
    /**
     * Batched provider status: ONE `listProviders()` round-trip, then derive every
     * requested provider's status from it.
     *
     * `listProviders` already returns EVERY provider (with its configured flag and
     * dynamic model id — the OpenAI-compatible provider's model is absent from the
     * static catalog, so this is the picker's only source). The old per-card
     * `providerStatus` fetched that whole list and threw away all but one entry, so
     * a settings screen with a dozen cards fired a dozen identical round-trips —
     * each proxied to the agent's sandbox in cloud. Fetching once and mapping N
     * cards off the result is the fix for HOU-650.
     */
    async providerStatuses(
      names: readonly string[],
    ): Promise<ProviderStatus[]> {
      const byId = new Map<
        string,
        { configured?: boolean; activeModel?: string }
      >();
      try {
        const engine = this.ctx.providerEngine();
        if (engine) {
          for (const p of await engine.listProviders()) byId.set(p.id, p);
        }
      } catch {
        /* sandbox unreachable / no agent selected → all report not-connected */
      }
      return names.map((name) => {
        const pid = toNewProvider(name);
        const p = pid ? byId.get(pid) : undefined;
        return {
          provider: name,
          cliInstalled: true,
          authState: p?.configured ? "authenticated" : "unauthenticated",
          cliName: name,
          installSource: "managed",
          cliPath: null,
          activeModel: p?.activeModel || undefined,
        } as ProviderStatus;
      });
    }
    /**
     * Live per-account usage for every connected provider (rate-limit windows
     * + prepaid balances), served by the runtime's `GET /providers/usage`.
     * Rides the SAME per-agent runtime routing as provider status: any real
     * agent's runtime serves the workspace-central credentials, so the
     * selection only picks a pod. Unlike the status probe this THROWS when the
     * engine is unreachable — the Usage page must show the real failure, never
     * a fabricated "no usage" (beta no-silent-failure policy).
     */
    async providerUsage(): Promise<ProviderUsage[]> {
      return this.ctx.providerEngine().listProviderUsage();
    }
  }
  return ProviderStatusMethods;
}
