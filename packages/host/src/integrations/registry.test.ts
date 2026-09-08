import { expect, test } from "vitest";
import { FakeIntegrationProvider } from "./fake";
import { IntegrationRegistry } from "./registry";

test("registers, resolves, and reports providers by id", () => {
  const composio = new FakeIntegrationProvider({ id: "composio" });
  const custom = new FakeIntegrationProvider({ id: "custom" });
  const reg = new IntegrationRegistry([composio, custom]);

  expect(reg.size).toBe(2);
  expect(reg.ids().sort()).toEqual(["composio", "custom"]);
  expect(reg.has("composio")).toBe(true);
  expect(reg.get("custom")).toBe(custom);
});

test("a duplicate id is a wiring bug, not a silent overwrite", () => {
  const reg = new IntegrationRegistry([
    new FakeIntegrationProvider({ id: "composio" }),
  ]);
  expect(() =>
    reg.register(new FakeIntegrationProvider({ id: "composio" })),
  ).toThrow(/already registered/);
});

test("an unknown id throws rather than returning undefined", () => {
  const reg = new IntegrationRegistry();
  expect(reg.has("composio")).toBe(false);
  expect(() => reg.get("composio")).toThrow(/unknown integration provider/);
});
