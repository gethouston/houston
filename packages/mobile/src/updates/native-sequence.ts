const PREFIX = "houston.ota.native_builtin_sequence.";

/** The store bundle records its native baseline before any OTA code can run. */
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
