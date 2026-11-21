import { expect, test } from "vitest";
import { StreamRegistry } from "./stream-registry";

test("ownsAnyTurn answers for turns this owner sent, not its observers", () => {
  const registry = new StreamRegistry();
  expect(registry.ownsAnyTurn()).toBe(false);

  registry.set("a", { kind: "observer", dispose: () => {} });
  expect(registry.ownsAnyTurn()).toBe(false);

  registry.set("b", { kind: "turn", dispose: () => {} });
  expect(registry.ownsAnyTurn()).toBe(true);

  registry.delete("b");
  expect(registry.ownsAnyTurn()).toBe(false);
});

test("ownsAnyTurn counts a send still handing off over an observer", () => {
  const registry = new StreamRegistry();
  registry.set("a", { kind: "observer", dispose: () => {} });
  expect(registry.beginSend("a")).toBe(true);
  expect(registry.ownsAnyTurn()).toBe(true);

  registry.endSend("a");
  expect(registry.ownsAnyTurn()).toBe(false);
});

test("a teardown releases every turn", () => {
  const registry = new StreamRegistry();
  registry.set("a", { kind: "turn", dispose: () => {} });
  registry.beginSend("b");
  registry.disposeAll();
  expect(registry.ownsAnyTurn()).toBe(false);
});
