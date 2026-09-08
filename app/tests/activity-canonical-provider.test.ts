import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { toCanonicalProviderId } from "../../packages/domain/src/provider-dialect.ts";

/**
 * A8: a display alias ("openai") must never land on disk. The domain's own
 * persistence boundary is pinned in `packages/domain/src/activities.test.ts`;
 * this pins the APP's writer, which builds the activity row itself.
 */

test("the app's activity writer canonicalizes the provider it stores", () => {
  const source = readFileSync(
    new URL("../src/data/activity.ts", import.meta.url),
    "utf8",
  );
  strictEqual(source.includes("toCanonicalProviderId(provider)"), true);
  // The alias must not also survive verbatim on the row it writes.
  strictEqual(/\n\s+provider,\n/.test(source), false);
});

test("the aliases a picker shows resolve to the ids pi runs on", () => {
  strictEqual(toCanonicalProviderId("openai"), "openai-codex");
  strictEqual(toCanonicalProviderId("openai-codex"), "openai-codex");
});
