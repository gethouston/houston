export * from "./stream-tuning";

import type { ActiveStream } from "./active-stream";

export { type ActiveStream, streamKey } from "./active-stream";

export class StreamRegistry {
  private readonly active = new Map<string, ActiveStream>();
  private readonly sending = new Set<string>();

  private readonly leaving = new Set<() => void>();
  private readonly turnStarts = new Map<string, number>();
  private disposeCount = 0;

  noteTurnStart(key: string): string {
    this.turnStarts.set(key, this.turnsStarted(key) + 1);
    return key;
  }
  turnsStarted(key: string): number {
    return this.turnStarts.get(key) ?? 0;
  }
  ownsTurn(key: string): boolean {
    return this.active.get(key)?.kind === "turn" || this.sending.has(key);
  }
  ownsUnacceptedSend(key: string): boolean {
    const entry = this.active.get(key);
    return this.sending.has(key) || (entry?.kind === "turn" && !entry.accepted);
  }
  ownsAnyTurn(): boolean {
    if (this.sending.size > 0) return true;
    for (const entry of this.active.values()) {
      if (entry.kind === "turn") return true;
    }
    return false;
  }
  ownTurnLeft(key: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (this.ownsTurn(key)) return;
        this.leaving.delete(check);
        resolve();
      };
      this.leaving.add(check);
      check();
    });
  }
  get disposals(): number {
    return this.disposeCount;
  }

  get(key: string): ActiveStream | undefined {
    return this.active.get(key);
  }
  set(key: string, entry: ActiveStream): void {
    this.active.set(key, entry);
    this.wakeLeaving();
  }
  delete(key: string): void {
    this.active.delete(key);
    this.wakeLeaving();
  }
  private readonly sendStops = new Map<string, () => (() => void) | null>();

  stopUnsent(key: string): (() => void) | null {
    const entry = this.active.get(key);
    if (entry?.kind === "turn" && entry.stopUnsent) return entry.stopUnsent();
    return this.sendStops.get(key)?.() ?? null;
  }
  armSendStop(key: string, stop: () => (() => void) | null): void {
    this.sendStops.set(key, stop);
  }
  disarmSendStop(key: string, stop: () => (() => void) | null): void {
    if (this.sendStops.get(key) === stop) this.sendStops.delete(key);
  }
  release(key: string, entry: ActiveStream): void {
    if (this.active.get(key) === entry) this.delete(key);
  }

  left(key: string, entry: ActiveStream, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        this.leaving.delete(check);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const check = () => {
        if (this.active.get(key) !== entry) done();
      };
      if (this.active.get(key) !== entry || signal.aborted) return resolve();
      this.leaving.add(check);
      signal.addEventListener("abort", done, { once: true });
    });
  }
  private wakeLeaving(): void {
    for (const check of [...this.leaving]) check();
  }

  beginSend(key: string): boolean {
    if (this.sending.has(key)) return false;
    this.sending.add(key);
    return true;
  }
  endSend(key: string): void {
    this.sending.delete(key);
    this.wakeLeaving();
  }
  isSending(key: string): boolean {
    return this.sending.has(key);
  }

  disposeAll(): void {
    for (const s of this.active.values()) s.dispose();
    this.active.clear();
    this.sending.clear();
    this.sendStops.clear();
    this.disposeCount++;
    this.wakeLeaving();
  }
}
