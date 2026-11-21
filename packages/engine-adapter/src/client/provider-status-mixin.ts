import { timeoutSignal } from "@houston/sdk/abort-signal";
import type {
  CredentialScope,
  ProviderHealth,
  ProviderStatus,
  ProviderUsage,
} from "@houston/wire-types";
import { toNewProvider } from "../synthetic";
import type { BaseCtor } from "./mixin";
import { withProviderAgentRetarget } from "./provider-agent-gone";
import { reportProbeFailure } from "./provider-probe-report";
import { providerRoutingSettled } from "./provider-routing";

const PROBE_TIMEOUT_MS = 15_000;

export function ProviderStatusMixin<TBase extends BaseCtor>(Base: TBase) {
  class ProviderStatusMethods extends Base {
    async providerStatus(name: string): Promise<ProviderStatus> {
      return (await this.providerStatuses([name]))[0];
    }
    async providerStatuses(
      names: readonly string[],
    ): Promise<ProviderStatus[]> {
      const byId = new Map<
        string,
        {
          configured?: boolean;
          activeModel?: string;
          credentialScope?: CredentialScope;
          health?: ProviderHealth;
          reconnectBy?: number;
        }
      >();
      let reachable = false;
      try {
        if (providerRoutingSettled(this.ctx)) {
          const list = await withProviderAgentRetarget(this.ctx, (target) =>
            (target
              ? this.ctx.providerEngineFor(target)
              : this.ctx.providerEngine()
            ).listProviders({ signal: timeoutSignal(PROBE_TIMEOUT_MS) }),
          );
          for (const p of list) byId.set(p.id, p);
          reachable = true;
        }
      } catch (error) {
        reportProbeFailure(error);
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
          ...(p?.credentialScope ? { credentialScope: p.credentialScope } : {}),
          ...(reachable
            ? p?.health
              ? { health: p.health }
              : {}
            : { health: "unreachable" as const }),
          ...(reachable && p?.reconnectBy !== undefined
            ? { reconnectBy: p.reconnectBy }
            : {}),
        } as ProviderStatus;
      });
    }

    /**
     * Shows which of the named AI providers one agent is signed in to.
     *
     * @assistant group:providers
     * @assistant hidden: the provider hub's own per-agent read, shaped for its rows; refreshStatus is the one to dispatch for the same sign-in.
     */
    async providerStatusesForAgent(
      agentId: string,
      names: readonly string[],
    ): Promise<ProviderStatus[]> {
      const byId = new Map(
        (await this.ctx.providerEngineFor(agentId).listProviders()).map((p) => [
          p.id,
          p,
        ]),
      );
      return names.map((name) => {
        const provider = toNewProvider(name);
        const status = provider ? byId.get(provider) : undefined;
        return {
          provider: name,
          cliInstalled: true,
          authState: status?.configured ? "authenticated" : "unauthenticated",
          cliName: name,
          installSource: "managed",
          cliPath: null,
          activeModel: status?.activeModel || undefined,
          ...(status?.health ? { health: status.health } : {}),
          ...(status?.reconnectBy !== undefined
            ? { reconnectBy: status.reconnectBy }
            : {}),
        } as ProviderStatus;
      });
    }
    /**
     * Shows how much of each connected AI provider's allowance is left.
     *
     * @assistant group:providers
     * @assistant hidden: the provider hub's live probe, which throws the moment an engine is unreachable; it is polled behind a confirmed connection, never dispatched.
     *
     * Live per-account usage for every connected provider (rate-limit windows
     * + prepaid balances), served by the runtime's `GET /providers/usage`.
     * Rides the SAME per-agent runtime routing as provider status: any real
     * agent's runtime serves the workspace-central credentials, so the
     * selection only picks a pod. Unlike the status probe this THROWS when the
     * engine is unreachable — the hub's Connected rows must show the real
     * failure, never a fabricated "no usage" (beta no-silent-failure policy).
     * The caller therefore only asks once at least one connection is CONFIRMED
     * (`hasConfirmedAccount`), so an unreachable engine is not polled blind.
     */
    async providerUsage(): Promise<ProviderUsage[]> {
      return this.ctx.providerEngine().listProviderUsage();
    }
  }
  return ProviderStatusMethods;
}
