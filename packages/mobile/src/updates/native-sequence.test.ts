import { expect, test, vi } from "vitest";
import { nativeBuiltinSequence } from "./native-sequence";

test("an OTA bundle keeps its native build's floor and a store upgrade seeds a new floor", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  expect(nativeBuiltinSequence("production", "4", 10, storage)).toBe(10);
  expect(nativeBuiltinSequence("production", "4", 20, storage)).toBe(10);
  expect(nativeBuiltinSequence("production", "5", 30, storage)).toBe(30);
  expect(nativeBuiltinSequence("preview", "5", 40, storage)).toBe(40);
});

test("invalid saved native baseline is reseeded", () => {
  for (const corrupt of ["invalid", ""]) {
    const storage = { getItem: () => corrupt, setItem: vi.fn() };
    expect(nativeBuiltinSequence("preview", "4", 10, storage)).toBe(10);
    expect(storage.setItem).toHaveBeenCalledWith(
      "houston.ota.native_builtin_sequence.preview.4",
      "10",
    );
  }
});
