import { expect, test } from "vitest";
import { asSendInput } from "./turn-inputs";

/**
 * The `turns/send` envelope guard: the bridge path hands `asSendInput` raw JSON,
 * so it must pass exactly the known per-turn mode literals and drop anything else
 * to undefined (leaving the turn on the runtime's "execute" default).
 */

const BASE = { conversationId: "c1", text: "hi" };

test("asSendInput passes the known mode literals through", () => {
  expect(asSendInput({ ...BASE, mode: "execute" }).mode).toBe("execute");
  expect(asSendInput({ ...BASE, mode: "plan" }).mode).toBe("plan");
  expect(asSendInput({ ...BASE, mode: "auto" }).mode).toBe("auto");
});

test("asSendInput drops an unknown mode to undefined", () => {
  expect(asSendInput({ ...BASE, mode: "AUTO" }).mode).toBeUndefined();
  expect(asSendInput({ ...BASE, mode: "" }).mode).toBeUndefined();
  expect(asSendInput({ ...BASE, mode: 1 }).mode).toBeUndefined();
  expect(asSendInput({ ...BASE }).mode).toBeUndefined();
});
