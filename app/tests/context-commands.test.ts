import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { FeedItem } from "@houston-ai/chat";
import { CONTEXT_COMMANDS } from "../src/components/assistant/context-commands.ts";
import { sessionContextUsage } from "../src/lib/context-usage.ts";

const locale = (lang: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../src/locales/${lang}/chat.json`, import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;

describe("composer context commands", () => {
  it("sends exactly the text the runtime parses as a command", () => {
    // A typo here would not fail: it would quietly send the agent a PROMPT
    // about compacting instead of compacting. The literals are the contract
    // with packages/runtime/src/session/conversation-command.ts.
    deepStrictEqual(
      CONTEXT_COMMANDS.map((c) => c.text),
      ["/compact", "/clear"],
    );
  });

  it("has an authored label in every language Houston ships", () => {
    for (const lang of ["en", "es", "pt"]) {
      const commands = locale(lang).contextCommands as Record<string, string>;
      for (const { labelKey } of CONTEXT_COMMANDS) {
        const key = labelKey.split(".")[1];
        ok(commands?.[key], `${lang} is missing chat:${labelKey}`);
      }
    }
  });

  it("localizes both boundary dividers everywhere too", () => {
    for (const lang of ["en", "es", "pt"]) {
      const chat = locale(lang);
      ok(chat.contextCleared, `${lang} is missing chat:contextCleared`);
      ok(
        chat.contextCompactedManual,
        `${lang} is missing chat:contextCompactedManual`,
      );
    }
  });
});

describe("context usage across a cleared boundary", () => {
  const usage = (contextTokens: number, id: string): FeedItem => ({
    feed_type: "final_result",
    id,
    data: {
      result: "",
      cost_usd: null,
      duration_ms: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        context_tokens: contextTokens,
      },
    },
  });

  it("reads empty again after a clear, keeping the window it learned", () => {
    const { latest, peakContextTokens } = sessionContextUsage([
      usage(400_000, "t1"),
      { feed_type: "context_cleared", data: null, id: "c1" },
    ]);
    // The model's context really is empty now, so the gauge must say so...
    strictEqual(latest, null);
    // ...but the peak still proves this provider's window is at least that
    // big, and the provider did not change.
    strictEqual(peakContextTokens, 400_000);
  });

  it("tracks the first turn after the clear from zero", () => {
    const { latest } = sessionContextUsage([
      usage(400_000, "t1"),
      { feed_type: "context_cleared", data: null, id: "c1" },
      usage(1_200, "t2"),
    ]);
    strictEqual(latest?.context_tokens, 1_200);
  });
});
