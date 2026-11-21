import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { toCanonicalProviderId } from "../../packages/domain/src/provider-dialect.ts";
import {
  applyActivityPatch,
  applyBulkPatch,
} from "../src/data/activity-bulk.ts";

test("the app's activity writer canonicalizes the provider it stores", () => {
  const source = readFileSync(
    new URL("../src/data/activity-writes.ts", import.meta.url),
    "utf8",
  );
  strictEqual(source.includes("toCanonicalProviderId(provider)"), true);
  strictEqual(/\n\s+provider,\n/.test(source), false);
});

test("the aliases a picker shows resolve to the ids pi runs on", () => {
  strictEqual(toCanonicalProviderId("openai"), "openai-codex");
  strictEqual(toCanonicalProviderId("openai-codex"), "openai-codex");
});

const ROW = {
  id: "m1",
  title: "Tidy the deck",
  status: "needs_you",
} as Parameters<typeof applyActivityPatch>[0];

test("an update canonicalizes the provider it stores, like the create does", () => {
  const patched = applyActivityPatch(ROW, { provider: "openai" }, "now");

  strictEqual(patched.provider, "openai-codex");
});

test("a bulk update canonicalizes every row it touches", () => {
  const rows = applyBulkPatch(
    [ROW, { ...ROW, id: "m2" }],
    new Set(["m1", "m2"]),
    { provider: "openai" },
    "now",
  );

  deepStrictEqual(
    rows.map((row) => row.provider),
    ["openai-codex", "openai-codex"],
  );
});

test("clearing a pin still deletes the key, and canonical ids pass through", () => {
  const pinned = applyActivityPatch(ROW, { provider: "anthropic" }, "now");
  strictEqual(pinned.provider, "anthropic");
  strictEqual(
    "provider" in applyActivityPatch(pinned, { provider: null }, "now"),
    false,
  );
});
