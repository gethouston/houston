import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * A9: the chat panel's fire-and-forget writes report their failures, and the
 * two comments that narrated a past design state the live rule instead. Both
 * are source seams (the swallow and the wording are what regress), pinned the
 * way the app's other seam guards are.
 */

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("chat model reads and pins report their failures", () => {
  const source = read("src/components/use-agent-chat-panel.tsx");
  strictEqual(source.includes('console.error("[chat] failed to pin'), false);
  for (const reason of [
    "chat.read-agent-model",
    "chat.read-default-provider",
    "chat.pin-conversation-model",
    "chat.save-last-model",
  ])
    strictEqual(source.includes(`logAndReportError("${reason}", err)`), true);
});

test("the live model rules are written in the present", () => {
  for (const path of [
    "../packages/domain/src/provider-default-models.ts",
    "../packages/runtime/src/session/exec-turn.ts",
  ])
    strictEqual(read(path).includes("used to be"), false);
});
