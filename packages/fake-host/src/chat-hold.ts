const HOLD_MAX_MS = 60_000;

let armed = false;
let release: (() => void) | null = null;

export function armHoldAfterFirstDelta(on: boolean): void {
  armed = on;
}

export function takeHold(): boolean {
  const take = armed;
  armed = false;
  return take;
}

export function waitForRelease(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, HOLD_MAX_MS);
    function done(): void {
      clearTimeout(timer);
      if (release === done) release = null;
      resolve();
    }
    release = done;
  });
}

export function releaseHeldTurn(): void {
  release?.();
}

export function resetHold(): void {
  armed = false;
  releaseHeldTurn();
}
