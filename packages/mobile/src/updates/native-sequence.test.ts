import { expect, test, vi } from "vitest";
import {
  migrateLegacyOtaSequence,
  nativeBuiltinSequence,
  otaPolicyKey,
  otaSequenceKey,
} from "./native-sequence";

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

test("the applied OTA sequence is keyed by channel and native build", () => {
  expect(otaSequenceKey("production", "12")).toBe(
    "houston.ota.sequence.production.12",
  );
});

test("the legacy per-channel sequence seeds the policy floor once", () => {
  const values = new Map([["houston.ota.sequence.production", "30"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  migrateLegacyOtaSequence("production", storage);
  expect(JSON.parse(values.get(otaPolicyKey("production")) ?? "")).toEqual({
    sequence: 30,
    required_native_build: 1,
  });
  expect(values.has("houston.ota.sequence.production")).toBe(false);
  values.set("houston.ota.sequence.production", "5");
  migrateLegacyOtaSequence("production", storage);
  expect(
    JSON.parse(values.get(otaPolicyKey("production")) ?? "").sequence,
  ).toBe(30);
  expect(values.has("houston.ota.sequence.production")).toBe(false);
});
