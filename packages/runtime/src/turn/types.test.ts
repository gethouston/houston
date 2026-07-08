import { expect, test } from "vitest";
import { parseTurnRequest } from "./types";

const BASE = {
  workspaceId: "w1",
  agentId: "a1",
  conversationId: "c1",
  text: "hello",
  gcsPrefix: "ws/w1/a1",
};

test("parseTurnRequest defaults mode to execute when absent", () => {
  expect(parseTurnRequest(BASE).mode).toBe("execute");
});

test("parseTurnRequest accepts an explicit plan mode", () => {
  expect(parseTurnRequest({ ...BASE, mode: "plan" }).mode).toBe("plan");
});

test("parseTurnRequest accepts an explicit auto mode", () => {
  expect(parseTurnRequest({ ...BASE, mode: "auto" }).mode).toBe("auto");
});

test("parseTurnRequest never trusts the wire — an unknown mode is execute", () => {
  expect(parseTurnRequest({ ...BASE, mode: "execute" }).mode).toBe("execute");
  expect(parseTurnRequest({ ...BASE, mode: "PLAN" }).mode).toBe("execute");
  expect(parseTurnRequest({ ...BASE, mode: "AUTO" }).mode).toBe("execute");
  expect(parseTurnRequest({ ...BASE, mode: "" }).mode).toBe("execute");
  expect(parseTurnRequest({ ...BASE, mode: 1 }).mode).toBe("execute");
});
