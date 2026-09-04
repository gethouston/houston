import {
  type RevocationTombstones,
  sharedRevocationTombstones,
} from "../credentials/revocation-tombstones";
import { credentialScopeKey } from "../credentials/scope-key";
import { LauncherClosedError } from "../ports";

const HEAL_COOLDOWN_MS = 5 * 60_000;

export type CredentialHeal = (args: {
  workspaceId: string;
  agentId: string;
  provider: string;
  /** WHOSE credential to heal; undefined = the single shared scope (HOU-976). */
  actingAs?: string;
}) => Promise<boolean>;

/**
 * undici hides the reason for a network failure (ECONNREFUSED, EAI_AGAIN, …)
 * behind a bare `TypeError: fetch failed`; the log line names it so a heal
 * that fails on a LIVE host says what actually broke.
 */
function describeHealError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  const code =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code: unknown }).code)
      : cause instanceof Error
        ? cause.message
        : undefined;
  return code ? `${error.message} (cause: ${code})` : error.message;
}

/**
 * Coalesces serve-miss recovery and limits each provider to one attempt/5m.
 *
 * Per (workspace, SCOPE, provider): one member's miss must not hand its result
 * to another member's serve, nor spend the cooldown that member needs (HOU-976).
 *
 * Rejects with `LauncherClosedError` while the host drains: a heal reads the
 * runtime's live credential, and a draining host has latched its launcher and
 * is killing that very runtime. The runtime's own serve sync is what arrives
 * here mid-drain (it probes every provider at once), so without this every
 * roll logged one Sentry error per provider per pod, fleet-wide, for a state
 * that is nothing but the shutdown (PRODUCT-1672). The rejection rides to the
 * server's catch, which answers 503 + Retry-After — the runtime's probe reads
 * that as transient and keeps its copy, instead of a marked 404 it would act
 * on as a verdict.
 */
export class CredentialServeHealer {
  private readonly inFlight = new Map<string, Promise<boolean>>();
  private readonly attemptedAt = new Map<string, number>();

  constructor(
    private readonly heal: CredentialHeal,
    private readonly now: () => number = Date.now,
    private readonly revocations: RevocationTombstones = sharedRevocationTombstones,
    /** Whether the host has begun stopping (local/host.ts `stop()`). */
    private readonly draining: () => boolean = () => false,
  ) {}

  attempt(args: Parameters<CredentialHeal>[0]): Promise<boolean> {
    // A serve miss caused by a provider REVOKING the credential must not be
    // healed by re-uploading the pod's copy of that same dead family
    // (HOUSTON-APP-530); the user has to reconnect, which clears the tombstone.
    if (
      this.revocations.active({
        workspaceId: args.workspaceId,
        provider: args.provider,
        actingAs: args.actingAs,
      })
    ) {
      return Promise.resolve(false);
    }
    // Refused before it starts: no attempt log, no cooldown spent — the
    // replacement host (or the next app start) heals with a clean slate.
    if (this.draining()) return Promise.reject(new LauncherClosedError());
    const key = `${args.workspaceId}:${credentialScopeKey({ actingAs: args.actingAs })}:${args.provider}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    if (this.now() - (this.attemptedAt.get(key) ?? 0) < HEAL_COOLDOWN_MS)
      return Promise.resolve(false);

    this.attemptedAt.set(key, this.now());
    console.info(
      `[sandbox/credential] heal attempted provider=${args.provider} agent=${args.agentId}`,
    );
    const attempt = this.heal(args)
      .then((healed) => {
        console.info(
          `[sandbox/credential] ${healed ? "healed" : "heal failed"} provider=${args.provider} agent=${args.agentId}`,
        );
        return healed;
      })
      .catch((error) => {
        // The launcher refused (already latched) or the runtime died under the
        // export fetch once the drain began: the same shutdown either way, and
        // never a fault worth a Sentry error.
        if (error instanceof LauncherClosedError || this.draining()) {
          console.info(
            `[sandbox/credential] heal aborted provider=${args.provider} agent=${args.agentId}: the host is shutting down`,
          );
          throw error instanceof LauncherClosedError
            ? error
            : new LauncherClosedError();
        }
        console.error(
          `[sandbox/credential] heal failed provider=${args.provider} agent=${args.agentId}:`,
          describeHealError(error),
        );
        return false;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, attempt);
    return attempt;
  }
}
