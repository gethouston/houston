import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * The approval card is the last thing a person reads before something
 * destructive happens, so it is worded in THEIR language for EVERY operation
 * that can raise one. A confirm operation with no sentence here would fall back
 * to the host's English, which is the bug this namespace exists to end.
 *
 * The catalog is generated from the live engine adapter, so a new destructive
 * operation lands in it automatically and fails here until it is worded.
 */

const read = (rel: string) =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));

const CONFIRM_OPERATIONS: { name: string; params: { name: string }[] }[] = read(
  "../../packages/host/src/assistant/assistant-catalog.generated.json",
).operations.filter((op: { confirm?: boolean }) => op.confirm);

const LOCALES = ["en", "es", "pt"] as const;

test("the catalog still carries operations that need an approval", () => {
  ok(CONFIRM_OPERATIONS.length > 0);
});

for (const locale of LOCALES) {
  const bundle = read(`../src/locales/${locale}/assistant-approvals.json`);

  test(`${locale} words every operation that raises an approval card`, () => {
    const missing = CONFIRM_OPERATIONS.filter(
      (op) => typeof bundle.operations[op.name] !== "string",
    ).map((op) => op.name);
    strictEqual(missing.join(", "), "");
  });

  test(`${locale} names every argument such a card can show`, () => {
    const missing: string[] = [];
    for (const op of CONFIRM_OPERATIONS)
      for (const param of op.params ?? [])
        if (
          typeof bundle.argumentsByOperation[op.name]?.[param.name] !==
            "string" &&
          typeof bundle.arguments[param.name] !== "string"
        )
          missing.push(`${op.name}.${param.name}`);
    strictEqual(missing.join(", "), "");
  });

  test(`${locale} words no operation the catalog does not have`, () => {
    const known = new Set(CONFIRM_OPERATIONS.map((op) => op.name));
    const stale = Object.keys(bundle.operations).filter((n) => !known.has(n));
    strictEqual(stale.join(", "), "");
  });
}
