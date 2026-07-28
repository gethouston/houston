import type {
  ProviderStatus,
  ProviderUsage,
} from "../../../../../ui/engine-client/src/types";
import { toNewProvider } from "../synthetic";
import type { BaseCtor } from "./mixin";
import { providerRoutingSettled } from "./provider-routing";

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
      // "unauthenticated" is only ever a CONFIRMED answer from the engine. An
      // unreachable engine (cold pod still waking after a relaunch/update, a
      // network drop) reports "unknown" instead: fabricating "unauthenticated"
      // flips every provider card to Connect and blocks the local-model tunnel
      // auto-reconnect, for connections that are still registered server-side.
      let reachable = false;
      try {
        // Do NOT probe before the active space's agent list has settled
        // (HOU-979). The probe routes per-agent, so the only id available then
        // is the raw pref — which right after a space switch still names the
        // PREVIOUS space's agent. Asking `/v1/agents/<other-space-agent>/…`
        // under the new `x-houston-org` 404s, and the catch below would report
        // "unknown" anyway; skipping the request reaches the same honest
        // "checking" answer without a cross-space call.
        if (providerRoutingSettled(this.ctx)) {
          const engine = this.ctx.providerEngine();
          if (engine) {
            for (const p of await engine.listProviders()) byId.set(p.id, p);
            reachable = true;
          }
        }
      } catch {
        /* engine unreachable → every card reports "unknown" below */
      }
      return names.map((name) => {
        const pid = toNewProvider(name);
        const p = pid ? byId.get(pid) : undefined;
        return {
          provider: name,
          cliInstalled: true,
          authState: reachable
            ? p?.configured
              ? "authenticated"
              : "unauthenticated"
            : "unknown",
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
