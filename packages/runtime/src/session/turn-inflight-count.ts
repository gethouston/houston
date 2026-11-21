let inFlight = 0;

export function holdTurnInFlight(): () => void {
  inFlight++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlight--;
  };
}

export async function withTurnInFlight<T>(work: () => Promise<T>): Promise<T> {
  const release = holdTurnInFlight();
  try {
    return await work();
  } finally {
    release();
  }
}

export function turnsInFlight(): number {
  return inFlight;
}
