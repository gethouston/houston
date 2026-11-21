import { expect, test } from "vitest";
import { asSendInput } from "./turn-inputs";

test("the send command admits only known user message grants", () => {
  expect(
    asSendInput({ conversationId: "c", text: "hire", grants: ["createAgent"] })
      .grants,
  ).toEqual(["createAgent"]);
  expect(() =>
    asSendInput({ conversationId: "c", text: "hire", grants: ["deleteAgent"] }),
  ).toThrow();
});

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

test("asSendInput keeps well-formed mentions", () => {
  expect(
    asSendInput({
      ...BASE,
      mentions: [{ userId: "u1", name: "Ada Lovelace" }, { userId: "u2" }],
    }).mentions,
  ).toEqual([{ userId: "u1", name: "Ada Lovelace" }, { userId: "u2" }]);
});

test("asSendInput drops junk mention entries but keeps the good ones", () => {
  expect(
    asSendInput({
      ...BASE,
      mentions: [
        null,
        "u9",
        42,
        {},
        { userId: "" },
        { userId: 7 },
        { userId: "u1", name: 3 },
        { userId: "u2", name: "Bo" },
      ],
    }).mentions,
  ).toEqual([{ userId: "u1" }, { userId: "u2", name: "Bo" }]);
});

test("asSendInput rejects a non-array mentions value outright", () => {
  expect(asSendInput({ ...BASE, mentions: "u1" }).mentions).toBeUndefined();
  expect(
    asSendInput({ ...BASE, mentions: { userId: "u1" } }).mentions,
  ).toBeUndefined();
  expect(asSendInput({ ...BASE, mentions: null }).mentions).toBeUndefined();
});

test("asSendInput caps a mention list at 32 entries", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ userId: `u${i}` }));
  expect(asSendInput({ ...BASE, mentions: many }).mentions).toHaveLength(32);
});

test("a send that mentions nobody carries no mentions at all", () => {
  expect(asSendInput({ ...BASE }).mentions).toBeUndefined();
  expect(asSendInput({ ...BASE, mentions: [] }).mentions).toBeUndefined();
  expect(
    asSendInput({ ...BASE, mentions: [{ userId: "" }] }).mentions,
  ).toBeUndefined();
});
