import type { WireFrame } from "@houston/runtime-client";
import { TurnEndCounter } from "./turn-end-counter";

export const isTerminal = (
  ev: WireFrame,
): ev is Extract<WireFrame, { type: "done" | "error" | "provider_error" }> =>
  ev.type === "done" || ev.type === "error" || ev.type === "provider_error";

export class SendHoldState {
  private on = false;
  private was = false;
  private readonly seen = new Set<string>();
  readonly ends = new TurnEndCounter();

  get holding(): boolean {
    return this.on;
  }
  get wasHeld(): boolean {
    return this.was;
  }
  hold(): void {
    this.on = true;
    this.was = true;
  }
  release(): void {
    this.on = false;
  }

  note(ev: WireFrame, mine: string | undefined, accepted: boolean): void {
    if (isTerminal(ev) && ev.turnId && ev.turnId !== mine) this.ends.bump();
    if (mine !== undefined || accepted) return;
    const id = ev.type === "sync" ? ev.data.turnId : ev.turnId;
    if (id) this.seen.add(id);
  }

  mayAdoptTerminal(): boolean {
    return !this.was;
  }
  mayAdoptRunning(turnId: string | undefined): boolean {
    return !(this.was && turnId !== undefined && this.seen.has(turnId));
  }
}
