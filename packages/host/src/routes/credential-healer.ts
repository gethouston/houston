const HEAL_COOLDOWN_MS = 5 * 60_000;

export type CredentialHeal = (args: {
  workspaceId: string;
  agentId: string;
  provider: string;
}) => Promise<boolean>;

/** Coalesces serve-miss recovery and limits each provider to one attempt/5m. */
export class CredentialServeHealer {
  private readonly inFlight = new Map<string, Promise<boolean>>();
  private readonly attemptedAt = new Map<string, number>();

  constructor(
    private readonly heal: CredentialHeal,
    private readonly now: () => number = Date.now,
  ) {}

  attempt(args: Parameters<CredentialHeal>[0]): Promise<boolean> {
    const key = `${args.workspaceId}:${args.provider}`;
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
