import type { WireFrame } from "@houston/runtime-client";
import { isTerminal } from "./send-hold-state";

export const MAX_FAILURES = 8;

const isFailure = (ev: WireFrame): boolean =>
  isTerminal(ev) && ev.type !== "done";

export class PreAcceptTurn {
  private frames: WireFrame[] | null = null;
  private turnId: string | undefined;
  private discardedTurnId: string | undefined;
  private readonly failures = new Map<string, WireFrame>();

  keepSync(ev: WireFrame & { type: "sync" }): void {
    this.clear();
    if (!ev.data.turnId) return;
    this.turnId = ev.data.turnId;
    this.frames = [];
    this.append(ev);
  }

  keep(ev: WireFrame): void {
    if (ev.turnId === undefined) return;
    if (ev.turnId === this.turnId) this.append(ev);
    if (!isFailure(ev)) return;
    this.failures.delete(ev.turnId);
    this.failures.set(ev.turnId, ev);
    const oldest = this.failures.keys().next().value;
    if (this.failures.size > MAX_FAILURES && oldest !== undefined)
      this.failures.delete(oldest);
  }

  keepWhileHeld(ev: WireFrame): void {
    if (ev.type === "sync") {
      this.clear();
      if (ev.data.running) this.keepSync(ev);
      return;
    }
    this.keep(ev);
  }

  shouldIgnore(ev: WireFrame): boolean {
    const turnId = ev.type === "sync" ? ev.data.turnId : ev.turnId;
    return turnId !== undefined && turnId === this.discardedTurnId;
  }

  clear(): void {
    this.frames = null;
    this.turnId = undefined;
  }

  release(): void {
    this.clear();
    this.failures.clear();
  }

  claim(turnId: string | undefined): WireFrame[] {
    const candidateTurnId = this.turnId;
    const failure =
      turnId === undefined ? undefined : this.failures.get(turnId);
    const frames =
      turnId !== undefined && turnId === candidateTurnId
        ? (this.frames ?? [])
        : failure
          ? [failure]
          : [];
    const discardedTurnId =
      turnId !== undefined &&
      candidateTurnId !== undefined &&
      turnId !== candidateTurnId
        ? candidateTurnId
        : undefined;
    this.release();
    this.discardedTurnId = discardedTurnId;
    return frames;
  }

  private append(ev: WireFrame): void {
    this.frames?.push(ev);
  }
}
