import {
  type RevocationTombstones,
  sharedRevocationTombstones,
} from "../credentials/revocation-tombstones";
import { credentialScopeKey } from "../credentials/scope-key";
import { LauncherClosedError } from "../ports";

const HEAL_COOLDOWN_MS = 5 * 60_000;

/**
 * Two network-level failures against the same runtime closer than this are
 * one incident. Matches the heal cooldown: a persistent outage re-reports once
 * per cooldown, never once per provider per sweep.
 */
const NETWORK_INCIDENT_GAP_MS = HEAL_COOLDOWN_MS;

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
 * A failure of the wire, not of the credential: undici's bare `fetch failed`
 * (connection refused/reset, a socket closed under the request) or the export
 * budget expiring (`AbortSignal.timeout` rejects with a TimeoutError). Either
 * says "this runtime is unreachable", which is one fact per runtime — not one
 * per provider the sweep happened to probe.
 */
function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === "fetch failed" ||
    error.name === "TimeoutError" ||
    error.name === "AbortError"
  );
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
 *
 * A network failure on a LIVE host is reported once per runtime per incident:
 * the runtime's sync probes every known provider (40+, 8 at a time), and each
 * miss heals through the same runtime socket, so a stalled or unreachable
 * runtime logged one Sentry error per provider — the HOUSTON-APP-5AD bucket
 * (PRODUCT-1687). The first failure stays a loud error naming the cause; the
 * rest of the incident is a warn breadcrumb.
 */
export class CredentialServeHealer {
  private readonly inFlight = new Map<string, Promise<boolean>>();
  private readonly attemptedAt = new Map<string, number>();
  /** Last network failure per (runtime, cause) — see `sameIncident`. */
  private readonly networkFailureAt = new Map<string, number>();

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
        const detail = describeHealError(error);
        if (
          isNetworkFailure(error) &&
          this.sameIncident(args.agentId, detail)
        ) {
          console.warn(
            `[sandbox/credential] heal failed provider=${args.provider} agent=${args.agentId}: ${detail} (same incident as the last reported failure)`,
          );
          return false;
        }
        console.error(
          `[sandbox/credential] heal failed provider=${args.provider} agent=${args.agentId}:`,
          detail,
        );
        return false;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, attempt);
    return attempt;
  }

  /**
   * Whether a network failure with this cause was already seen against this
   * runtime within the incident gap. Every failure extends the incident, so a
   * runtime that stays unreachable reports once, and again only after a quiet
   * gap — the runtime-side serve-log posture (PRODUCT-1399).
   */
  private sameIncident(agentId: string, detail: string): boolean {
    const key = `${agentId}|${detail}`;
    const now = this.now();
    const last = this.networkFailureAt.get(key);
    this.networkFailureAt.set(key, now);
    return last !== undefined && now - last < NETWORK_INCIDENT_GAP_MS;
  }
}
