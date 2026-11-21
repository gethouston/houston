let draining = false;

export function beginDrain(): void {
  draining = true;
}

export function isDraining(): boolean {
  return draining;
}

export function resetDrainForTests(): void {
  draining = false;
}
