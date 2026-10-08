const PREFIX = "houston.ota.native_builtin_sequence.";

/** The store bundle records its native baseline before any OTA code can run. */
export function nativeBuiltinSequence(
  channel: "production" | "preview",
  baked: number,
  storage: Pick<Storage, "getItem" | "setItem">,
): number {
  const key = `${PREFIX}${channel}`;
  const saved = storage.getItem(key);
  if (saved === null) {
    storage.setItem(key, String(baked));
    return baked;
  }
  const value = Number(saved);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid native built-in OTA sequence");
  return value;
}
