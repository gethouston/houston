import type {
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";
import { type PiCred, readAuthFile, writeAuthFile } from "../auth/auth-file";
import { maskAccessOnly, needsServeSync } from "../auth/empty-refresh-guard";
import {
  currentTurnCredentialChannel,
  type TurnCredentialChannel,
} from "../auth/turn-credential-channel";
import { recordUsedToken } from "../auth/used-token";
import { reserveTurnCredential } from "./turn-credential-reserve";

export const TURN_RESERVE_RETRY_MS = 30_000;

export type TurnReserve = (
  channel: TurnCredentialChannel,
  authPath: string,
) => Promise<unknown>;

export class TurnCredentialStore implements CredentialStore {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly reserves = new Map<string, Promise<unknown>>();
  private readonly retryAt = new Map<string, number>();

  constructor(
    private readonly authPath: string,
    private readonly reserve: TurnReserve = reserveTurnCredential,
    private readonly now: () => number = Date.now,
  ) {}

  private entries(): Record<string, Credential> {
    return readAuthFile(this.authPath) as Record<string, Credential>;
  }

  async read(providerId: string): Promise<Credential | undefined> {
    if (needsServeSync(this.entries()[providerId], this.now()))
      await this.reserveOnce(providerId);
    const cred = this.entries()[providerId];
    if (cred?.type === "oauth" && cred.access)
      recordUsedToken(providerId, cred.access);
    return cred;
  }

  private reserveOnce(providerId: string): Promise<unknown> {
    const channel = currentTurnCredentialChannel();
    if (channel?.provider !== providerId || channel.kind !== "oauth")
      return Promise.resolve();
    if (this.now() < (this.retryAt.get(providerId) ?? 0))
      return Promise.resolve();
    const inflight = this.reserves.get(providerId);
    if (inflight) return inflight;
    const run = this.reserve(channel, this.authPath).finally(() => {
      this.reserves.delete(providerId);
      if (needsServeSync(this.entries()[providerId], this.now()))
        this.retryAt.set(providerId, this.now() + TURN_RESERVE_RETRY_MS);
    });
    this.reserves.set(providerId, run);
    return run;
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return Object.entries(this.entries()).map(([providerId, cred]) => ({
      providerId,
      type: cred.type,
    }));
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    return this.enqueue(providerId, async () => {
      const next = await fn(maskAccessOnly(this.entries()[providerId]));
      if (next !== undefined)
        this.write({ ...this.entries(), [providerId]: next });
      const settled = this.entries()[providerId];
      if (settled?.type === "oauth" && settled.access)
        recordUsedToken(providerId, settled.access);
      return settled;
    });
  }

  async delete(providerId: string): Promise<void> {
    await this.enqueue(providerId, async () => {
      const { [providerId]: _gone, ...rest } = this.entries();
      this.write(rest);
    });
  }

  private write(entries: Record<string, Credential>): void {
    writeAuthFile(this.authPath, entries as Record<string, PiCred>);
  }

  private enqueue<T>(providerId: string, work: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(providerId) ?? Promise.resolve();
    const run = prev.then(work, work);
    this.chains.set(
      providerId,
      run.catch(() => undefined),
    );
    return run;
  }
}
