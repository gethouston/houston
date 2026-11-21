const PREFIX = "houston.ota.native_builtin_sequence.";

export function nativeBuiltinSequence(
  channel: "production" | "preview",
  nativeBuild: string,
  baked: number,
  storage: Pick<Storage, "getItem" | "setItem">,
): number {
  const key = `${PREFIX}${channel}.${nativeBuild}`;
  const saved = storage.getItem(key);
  const value = saved === null || saved.trim() === "" ? NaN : Number(saved);
  if (!Number.isSafeInteger(value) || value < 0) {
    storage.setItem(key, String(baked));
    return baked;
  }
  return value;
}

export function otaSequenceKey(
  channel: "production" | "preview",
  nativeBuild: string,
): string {
  return `houston.ota.sequence.${channel}.${nativeBuild}`;
}

export function otaPolicyKey(channel: "production" | "preview"): string {
  return `houston.ota.policy.${channel}`;
}

export function migrateLegacyOtaSequence(
  channel: "production" | "preview",
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): void {
  const legacyKey = `houston.ota.sequence.${channel}`;
  const legacy = storage.getItem(legacyKey);
  if (legacy === null) return;
  const sequence = Number(legacy);
  if (
    storage.getItem(otaPolicyKey(channel)) === null &&
    legacy.trim() !== "" &&
    Number.isSafeInteger(sequence) &&
    sequence > 0
  )
    storage.setItem(
      otaPolicyKey(channel),
      JSON.stringify({ sequence, required_native_build: 1 }),
    );
  storage.removeItem(legacyKey);
}
