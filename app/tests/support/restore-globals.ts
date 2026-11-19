// Snapshots `globalThis` properties so a test file can put them back exactly
// as it found them (AGENTS.md, "Test isolation"). A property that was absent
// is deleted again rather than left behind as `undefined`: other files in the
// shared process check `"window" in globalThis` or install their own.

/** Snapshot `keys` now; the returned function restores that snapshot. */
export function snapshotGlobals(keys: readonly string[]): () => void {
  const saved = keys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
}
