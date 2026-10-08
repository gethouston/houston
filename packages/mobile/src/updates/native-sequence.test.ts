import { expect, test, vi } from "vitest";
import { nativeBuiltinSequence } from "./native-sequence";

test("an OTA bundle keeps the store build's baked baseline", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  expect(nativeBuiltinSequence("production", 10, storage)).toBe(10);
  expect(nativeBuiltinSequence("production", 20, storage)).toBe(10);
});

test("invalid saved native baseline fails closed", () => {
  const storage = { getItem: () => "invalid", setItem: vi.fn() };
  expect(() => nativeBuiltinSequence("preview", 10, storage)).toThrow(
    "Invalid native",
  );
});
