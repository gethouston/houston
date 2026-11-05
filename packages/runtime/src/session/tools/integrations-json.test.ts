import { expect, test } from "vitest";
import { layoutJson } from "./integrations-json";

test("a value that fits on one line stays minified", () => {
  expect(layoutJson({ ok: 1, labels: ["INBOX", "UNREAD"], to: null })).toBe(
    '{"ok":1,"labels":["INBOX","UNREAD"],"to":null}',
  );
});

test("a long scalar stays whole on its line instead of being split", () => {
  const body = "x".repeat(900);
  expect(layoutJson({ body, id: 7 })).toBe(
    `{\n "body": "${body}",\n "id": 7\n}`,
  );
});

test("the laid-out text parses back to the same value", () => {
  const value = {
    results: Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      tags: ["a", "b"],
      nested: { deep: [{ text: "y".repeat(50), n: i }], empty: {} },
      missing: undefined,
    })),
    paging: { next: null },
  };
  expect(JSON.parse(layoutJson(value))).toEqual(
    JSON.parse(JSON.stringify(value)),
  );
});

test("a payload nested a thousand deep stays minified past the open depth", () => {
  let value: unknown = "x".repeat(700);
  for (let i = 0; i < 1000; i++) value = { child: value };
  const text = layoutJson(value);
  const lines = text.split("\n");
  expect(lines).toHaveLength(65);
  expect(lines[32]?.startsWith(`${" ".repeat(32)}"child": {"child":`)).toBe(
    true,
  );
  expect(JSON.parse(text)).toEqual(value);
});
