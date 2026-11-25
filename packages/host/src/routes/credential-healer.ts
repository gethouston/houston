import {
  type RevocationTombstones,
  sharedRevocationTombstones,
} from "../credentials/revocation-tombstones";
import { credentialScopeKey } from "../credentials/scope-key";
import { AgentRenamingError, LauncherClosedError } from "../ports";

const HEAL_COOLDOWN_MS = 5 * 60_000;

const NETWORK_INCIDENT_GAP_MS = HEAL_COOLDOWN_MS;

export type CredentialHeal = (args: {
  workspaceId: string;
  agentId: string;
  provider: string;
  actingAs?: string;
}) => Promise<boolean>;

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

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === "fetch failed" ||
    error.name === "TimeoutError" ||
    error.name === "AbortError"
  );
}

// WHY: Keyed per acting identity too; a shared slot would capture one member's credential onto another. ADR-0016
export class CredentialServeHealer {
  private readonly inFlight = new Map<string, Promise<boolean>>();
  private readonly attemptedAt = new Map<string, number>();
  private readonly networkFailureAt = new Map<string, number>();

  constructor(
    private readonly heal: CredentialHeal,
    private readonly now: () => number = Date.now,
    private readonly revocations: RevocationTombstones = sharedRevocationTombstones,
    private readonly draining: () => boolean = () => false,
  ) {}

  attempt(args: Parameters<CredentialHeal>[0]): Promise<boolean> {
    if (
      this.revocations.active({
        workspaceId: args.workspaceId,
        provider: args.provider,
        actingAs: args.actingAs,
      })
    ) {
      return Promise.resolve(false);
    }
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
        if (error instanceof AgentRenamingError) {
          this.attemptedAt.delete(key);
          console.info(
            `[sandbox/credential] heal deferred provider=${args.provider} agent=${args.agentId}: the agent is being renamed`,
          );
          throw error;
        }
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

  private sameIncident(agentId: string, detail: string): boolean {
    const key = `${agentId}|${detail}`;
    const now = this.now();
    const last = this.networkFailureAt.get(key);
    this.networkFailureAt.set(key, now);
    return last !== undefined && now - last < NETWORK_INCIDENT_GAP_MS;
  }
}
