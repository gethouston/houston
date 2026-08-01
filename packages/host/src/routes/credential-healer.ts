import { credentialScopeKey } from "../credentials/scope-key";

const HEAL_COOLDOWN_MS = 5 * 60_000;

export type CredentialHeal = (args: {
  workspaceId: string;
  agentId: string;
  provider: string;
  /** WHOSE credential to heal; undefined = the single shared scope (HOU-976). */
  actingAs?: string;
}) => Promise<boolean>;

/**
 * Coalesces serve-miss recovery and limits each provider to one attempt/5m.
 *
 * Per (workspace, SCOPE, provider): one member's miss must not hand its result
 * to another member's serve, nor spend the cooldown that member needs (HOU-976).
 */
export class CredentialServeHealer {
  private readonly inFlight = new Map<string, Promise<boolean>>();
  private readonly attemptedAt = new Map<string, number>();

  constructor(
    private readonly heal: CredentialHeal,
    private readonly now: () => number = Date.now,
  ) {}

  attempt(args: Parameters<CredentialHeal>[0]): Promise<boolean> {
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
        console.error(
          `[sandbox/credential] heal failed provider=${args.provider} agent=${args.agentId}:`,
          error instanceof Error ? error.message : String(error),
        );
        return false;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, attempt);
    return attempt;
  }
}
